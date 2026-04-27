import axios from 'axios';
import FormData from 'form-data';

class ZohoCRMClient {
  constructor() {
    // Use v7 API with .com.au datacenter (Australia) as per requirements
    // Support datacenter configuration via environment variable
    const datacenter = process.env.ZOHO_DATACENTER || 'com.au';
    this.baseURL = `https://www.zohoapis.${datacenter}/crm/v7`;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenCacheDuration = 50 * 60 * 1000; // 50 minutes (tokens typically last 1 hour)
  }

  async getAccessToken(forceRefresh = false) {
    try {
      // Return cached token if still valid
      if (!forceRefresh && this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        console.log('🔑 Using cached Zoho access token');
        return this.accessToken;
      }

      // Support both ACCESSTOKEN_URL (working project) and ZOHO_ACCESS_TOKEN_URL (backward compatibility)
      const tokenUrl = process.env.ACCESSTOKEN_URL || process.env.ZOHO_ACCESS_TOKEN_URL;
      if (!tokenUrl) {
        console.warn('⚠️ ACCESSTOKEN_URL or ZOHO_ACCESS_TOKEN_URL environment variable not set - Zoho CRM features will be disabled');
        // Return null instead of throwing to prevent app breaking
        return null;
      }

      console.log('🔑 Fetching fresh Zoho access token from:', tokenUrl);
      const response = await axios.get(tokenUrl, {
        timeout: 30000, // 30 second timeout
        // Add retry for network issues
        validateStatus: (status) => status < 500, // Don't throw on 4xx/5xx
      });
      
      // Log response for debugging
      console.log('📦 Token response structure:', JSON.stringify(response.data, null, 2));
      
      // Handle different response formats:
      // 1. Simple format: { access_token: "..." }
      // 2. Zoho Functions format: { details: { output: "token" } }
      // 3. Zoho Functions format: { output: "token" }
      let token = null;
      
      if (response.data.access_token) {
        token = response.data.access_token;
      } else if (response.data.details?.output) {
        token = response.data.details.output;
      } else if (response.data.output) {
        token = response.data.output;
      } else if (typeof response.data === 'string') {
        token = response.data;
      }
      
      // Strip "Zoho-oauthtoken" prefix if present (we'll add it back when making requests)
      // This ensures we don't double-prefix the token
      if (token && typeof token === 'string') {
        token = token.replace(/^Zoho-oauthtoken\s+/, '');
      }
      
      if (!token) {
        console.error('❌ Access token not found in response:', response.data);
        throw new Error('Access token not found in response');
      }
      
      // Store token (without prefix, we'll add it when making requests)
      this.accessToken = token;
      this.tokenExpiry = Date.now() + this.tokenCacheDuration;
      console.log('✅ Zoho access token cached until:', new Date(this.tokenExpiry).toISOString());
      
      return this.accessToken;
    } catch (error) {
      console.error('⚠️ Failed to get Zoho access token:', error.message);
      console.error('Error details:', error.response?.data || error);
      // Return null instead of throwing to prevent app breaking
      // This allows the app to continue even if Zoho is unavailable
      return null;
    }
  }

  async makeRequest(method, endpoint, data = null, params = null, retryCount = 0) {
    const token = await this.getAccessToken();
    
    // If token is null, return empty result instead of making request
    if (!token) {
      console.warn('⚠️ No Zoho access token available - skipping API request');
      return { data: [] };
    }
    
    const config = {
      method,
      url: `${this.baseURL}${endpoint}`, // baseURL already includes /v7
      headers: {
        // Use exact format: Authorization: Zoho-oauthtoken <token>
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (params) {
      config.params = params;
    }

    if (data && (method === 'post' || method === 'put')) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      // Retry once with fresh token if we get 401 Unauthorized
      if (error.response?.status === 401 && retryCount === 0) {
        console.log('⚠️  Got 401 from Zoho, refreshing token and retrying...');
        const freshToken = await this.getAccessToken(true); // Force refresh
        config.headers.Authorization = `Zoho-oauthtoken ${freshToken}`;
        
        try {
          const retryResponse = await axios(config);
          return retryResponse.data;
        } catch (retryError) {
          console.error('Zoho API Error after retry:', retryError.response?.data || retryError.message);
          throw retryError;
        }
      }
      
      // Extract detailed error information
      const zohoError = error.response?.data;
      const statusCode = error.response?.status;
      
      // Log detailed error information
      console.error('Zoho API Error:', {
        status: statusCode,
        code: zohoError?.code,
        message: zohoError?.message || error.message,
        details: zohoError?.details || zohoError,
      });
      
      // Create a more informative error
      if (zohoError) {
        const errorMessage = zohoError.message || `Zoho API error: ${zohoError.code || statusCode}`;
        const enhancedError = new Error(errorMessage);
        enhancedError.code = zohoError.code;
        enhancedError.status = statusCode;
        enhancedError.details = zohoError.details || zohoError;
        throw enhancedError;
      }
      
      throw error;
    }
  }

  async searchRecords(moduleName, criteria) {
    try {
      const response = await this.makeRequest(
        'get',
        `/${moduleName}/search`,
        null,
        { criteria }
      );
      // v7 API search returns { data: [...] }
      // makeRequest returns response.data, so response here is the axios response.data
      // v7 API structure: { data: [...] }
      return response.data || [];
    } catch (error) {
      if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Search records by email using query parameter
   * @param {string} moduleName - Module name (e.g., 'Contacts')
   * @param {string} email - Email address to search for
   * @returns {Promise<Array>} Array of matching records
   */
  async searchByEmail(moduleName, email) {
    try {
      const response = await this.makeRequest(
        'get',
        `/${moduleName}/search`,
        null,
        { email }
      );
      // v7 API search returns { data: [...] }
      return response.data || [];
    } catch (error) {
      if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
        return [];
      }
      throw error;
    }
  }

  async getRecord(moduleName, recordId) {
    try {
      const response = await this.makeRequest('get', `/${moduleName}/${recordId}`);
      
      // Log response structure for debugging
      console.log(`📦 Response structure for ${moduleName}/${recordId}:`, JSON.stringify(response, null, 2));
      
      // v7 API returns { data: [{...}] } - get first element
      const record = response.data?.[0] || null;
      
      if (!record) {
        console.warn(`⚠️ No record found at response.data[0] for ${moduleName}/${recordId}`);
        console.warn('Response structure:', JSON.stringify(response, null, 2));
      }
      
      return record;
    } catch (error) {
      console.error(`Error fetching ${moduleName} record ${recordId}:`, error.message);
      console.error('Error details:', error.response?.data || error);
      return null;
    }
  }

  async createRecord(moduleName, recordData) {
    try {
      const response = await this.makeRequest('post', `/${moduleName}`, {
        data: [recordData],
      });
      // v7 API returns { data: [{...}] } - get first element
      return response.data?.[0] || null;
    } catch (error) {
      console.error(`Error creating ${moduleName} record:`, error.message);
      throw error;
    }
  }

  async updateRecord(moduleName, recordId, updateData) {
    try {
      const response = await this.makeRequest('put', `/${moduleName}`, {
        data: [{
          id: recordId,
          ...updateData,
        }],
      });
      // v7 API returns { data: [{...}] } - get first element
      return response.data?.[0] || null;
    } catch (error) {
      console.error(`Error updating ${moduleName} record ${recordId}:`, error.message);
      throw error;
    }
  }

  async findContactByEmail(email) {
    try {
      // Use email as query parameter: GET /Contacts/search?email={{email}}
      console.log(`🔍 Searching for contact with email: ${email}`);
      const contacts = await this.searchByEmail('Contacts', email);
      console.log(`📋 Search returned ${contacts.length} contact(s)`);
      
      if (contacts.length > 0) {
        console.log('✅ Contact found:', contacts[0].id);
        console.log('📦 Contact data:', JSON.stringify(contacts[0], null, 2));
        return contacts[0];
      }
      
      console.log('📭 No contacts found');
      return null;
    } catch (error) {
      console.error(`❌ Error finding contact by email ${email}:`, error.message);
      console.error('Error details:', error.response?.data || error);
      return null;
    }
  }

  async coqlQuery(selectQuery) {
    try {
      // COQL uses v7 endpoint
      const token = await this.getAccessToken();
      const config = {
        method: 'post',
        url: `${this.baseURL}/coql`,
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        data: {
          select_query: selectQuery,
        },
      };
      const response = await axios(config);
      // v7 COQL returns { data: [...] }
      return response.data.data || [];
    } catch (error) {
      if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
        return [];
      }
      console.error('COQL query error:', error.message);
      throw error;
    }
  }

  /**
   * Get related records from a related list
   * Format: GET /{module_api_name}/{record_id}/{related_list_api_name}?fields={fields}
   * Examples:
   *   - Contacts/{recordId}/Deals?fields=Deal_Name,Stage,Amount
   *   - Contacts/{recordId}/Partner_Dependents?fields=First_Name,Last_Name,Relationship_to_Applicant,Date_of_Birth,Citizenship
   * @param {string} moduleName - Module name (e.g., 'Contacts')
   * @param {string} recordId - Record ID
   * @param {string} relatedListName - Related list API name (e.g., 'Partner_Dependents', 'Deals')
   * @param {string} fields - Optional comma-separated list of fields to retrieve. If not provided, will use default fields based on related list type.
   * @returns {Promise<Array>} Array of related records
   */
  async getRelatedRecords(moduleName, recordId, relatedListName, fields = null) {
    try {
      // Determine fields based on related list type if not provided
      // Based on actual Zoho API response structure
      if (!fields) {
        if (relatedListName === 'Partner_Dependents') {
          // Fields we actually need from the response
          fields = 'id,First_Name,Name,Relationship_to_Applicant,Date_of_Birth,Gender,Email,Citizenship';
        } else if (relatedListName === 'Deals') {
          // Fields for Deals/Applications
          fields = 'id,Deal_Name,DealName,Visa_Type,Deal_Stage,Stage,Amount,Closing_Date,Probability,Account_Name,Contact_Name,Owner,Modified_Time,Last_Activity_Time';
        } else if (relatedListName === 'Matter_Documents') {
          // Fields for Matter_Documents - include multiple name field variations, document_Serial for sorting, and Comments/Decline_Reason fields
          fields = 'id,Matter_Document_Name,Document_Name,Name,Document_Status,Created_Time,File_Name,File_Size,Modified_Time,Owner,Parent_Id,document_Serial,Comments,Rejection_Comments,Decline_Reason';
        } else if (relatedListName === 'Client_Messages') {
          // Fields for Client_Messages
          fields = 'id,Name,Message_from_Client,Reply_Message,Time_Sent,Time_Replied,Created_Time,Modified_Time';
        } else {
          // Default: get id and basic fields
          fields = 'id';
        }
      }
      
      console.log(`🔍 Fetching related records: GET /${moduleName}/${recordId}/${relatedListName}?fields=${fields}`);
      
      const response = await this.makeRequest(
        'get',
        `/${moduleName}/${recordId}/${relatedListName}`,
        null,
        { fields } // Pass fields as query parameter
      );
      
      // Log raw response structure for debugging
      console.log(`📦 Raw response for ${moduleName}/${recordId}/${relatedListName}:`, JSON.stringify(response, null, 2));
      
      // Handle different possible response structures:
      // 1. { data: [...] } - v7 API standard format
      // 2. [...] - direct array (sometimes returned)
      // 3. { data: { data: [...] } } - nested structure
      let records = [];
      
      if (Array.isArray(response)) {
        // Response is already an array
        records = response;
      } else if (response?.data) {
        // Response has a data property
        if (Array.isArray(response.data)) {
          records = response.data;
        } else if (response.data?.data && Array.isArray(response.data.data)) {
          // Nested data structure
          records = response.data.data;
        }
      }
      
      console.log(`✅ Found ${records.length} related records in ${relatedListName}`);
      
      if (records.length > 0) {
        console.log(`📋 First record sample:`, JSON.stringify(records[0], null, 2));
      }
      
      return records;
    } catch (error) {
      // Handle different error cases
      if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
        console.log(`📭 No related records found for ${relatedListName} (204 or NO_DATA)`);
        return [];
      }
      if (error.status === 204 || error.code === 'NO_DATA') {
        console.log(`📭 No related records found for ${relatedListName}`);
        return [];
      }
      console.error(`❌ Error fetching related records from ${relatedListName}:`, error.message);
      console.error('Error details:', error.response?.data || error.details || error);
      // Return empty array instead of throwing to prevent blocking the flow
      return [];
    }
  }

  /**
   * Create a related record in a related list
   * @param {string} moduleName - Module name (e.g., 'Contacts')
   * @param {string} recordId - Record ID
   * @param {string} relatedListName - Related list API name (e.g., 'Partner_Dependents')
   * @param {Object} relatedData - Data for the related record
   * @returns {Promise<Object>} Created record
   */
  async createRelatedRecord(moduleName, recordId, relatedListName, relatedData) {
    try {
      const response = await this.makeRequest(
        'post',
        `/${moduleName}/${recordId}/${relatedListName}`,
        {
          data: [relatedData],
        }
      );
      // v7 API returns { data: [{...}] } - get first element
      return response.data?.[0] || null;
    } catch (error) {
      console.error(`Error creating related record in ${relatedListName}:`, error.message);
      throw error;
    }
  }

  /**
   * Update a related record in a related list
   * @param {string} moduleName - Module name (e.g., 'Contacts')
   * @param {string} recordId - Record ID
   * @param {string} relatedListName - Related list API name (e.g., 'Partner_Dependents')
   * @param {string} relatedRecordId - Related record ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated record
   */
  async updateRelatedRecord(moduleName, recordId, relatedListName, relatedRecordId, updateData) {
    try {
      const response = await this.makeRequest(
        'put',
        `/${moduleName}/${recordId}/${relatedListName}`,
        {
          data: [{
            id: relatedRecordId,
            ...updateData,
          }],
        }
      );
      // v7 API returns { data: [{...}] } - get first element
      return response.data?.[0] || null;
    } catch (error) {
      console.error(`Error updating related record in ${relatedListName}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a related record from a related list
   * @param {string} moduleName - Module name (e.g., 'Contacts')
   * @param {string} recordId - Record ID
   * @param {string} relatedListName - Related list API name (e.g., 'Partner_Dependents')
   * @param {string} relatedRecordId - Related record ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteRelatedRecord(moduleName, recordId, relatedListName, relatedRecordId) {
    try {
      await this.makeRequest(
        'delete',
        `/${moduleName}/${recordId}/${relatedListName}/${relatedRecordId}`
      );
      return true;
    } catch (error) {
      console.error(`Error deleting related record from ${relatedListName}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync dependencies to Partner_Dependents related list
   * This will replace all existing dependents with the new list
   * @param {string} contactId - Contact ID
   * @param {Array} dependencies - Array of dependency objects
   * @returns {Promise<Array>} Array of created/updated related records
   */
  async syncDependencies(contactId, dependencies) {
    try {
      const relatedListName = 'Partner_Dependents';
      
      // Get existing dependents
      const existingDependents = await this.getRelatedRecords('Contacts', contactId, relatedListName);
      console.log(`📋 Found ${existingDependents.length} existing dependents`);

      // Delete all existing dependents (we'll replace them with the new list)
      for (const dependent of existingDependents) {
        if (dependent.id) {
          try {
            await this.deleteRelatedRecord('Contacts', contactId, relatedListName, dependent.id);
            console.log(`🗑️ Deleted dependent: ${dependent.id}`);
          } catch (error) {
            console.error(`⚠️ Failed to delete dependent ${dependent.id}:`, error.message);
            // Continue with other deletions even if one fails
          }
        }
      }

      // Create new dependents
      const createdDependents = [];
      if (dependencies && dependencies.length > 0) {
        for (const dep of dependencies) {
          // Map dependency fields to Zoho Contact fields
          const dependentData = {
            First_Name: dep.firstName || '',
            Last_Name: dep.lastName || '',
            // Map relationship field - adjust field name based on your Zoho setup
            Relationship: dep.relationship || '',
            // Map date of birth - adjust field name based on your Zoho setup
            Date_of_Birth: dep.dateOfBirth || '',
            // Map citizenship - adjust field name based on your Zoho setup
            Citizenship: dep.citizenship || '',
          };

          try {
            const created = await this.createRelatedRecord('Contacts', contactId, relatedListName, dependentData);
            if (created) {
              createdDependents.push(created);
              console.log(`✅ Created dependent: ${dep.firstName} ${dep.lastName}`);
            }
          } catch (error) {
            console.error(`❌ Failed to create dependent ${dep.firstName} ${dep.lastName}:`, error.message);
            // Continue with other dependents even if one fails
          }
        }
      }

      console.log(`✅ Synced ${createdDependents.length} dependents to Partner_Dependents`);
      return createdDependents;
    } catch (error) {
      console.error('❌ Error syncing dependencies:', error.message);
      throw error;
    }
  }

  /**
   * Upload a file as an attachment to a Zoho CRM record
   * @param {string} moduleName - Module name (e.g., 'Deals', 'Contacts')
   * @param {string} recordId - Record ID (e.g., Deal ID)
   * @param {Buffer|Stream} fileBuffer - File buffer to upload
   * @param {string} fileName - File name (must include extension)
   * @param {string} contentType - Content type (e.g., 'image/jpeg', 'application/pdf')
   * @returns {Promise<Object>} Upload response from Zoho
   */
  async uploadAttachment(moduleName, recordId, fileBuffer, fileName, contentType = null) {
    try {
      const token = await this.getAccessToken();
      
      if (!token) {
        throw new Error('No Zoho access token available');
      }

      // Use v8 API for attachments as per Zoho documentation
      const datacenter = process.env.ZOHO_DATACENTER || 'com.au';
      const baseURL = `https://www.zohoapis.${datacenter}/crm/v8`;
      
      // Create FormData for file upload (server-side only)
      // Match curl format: -F "file=@filename"
      const formData = new FormData();
      
      // Append file buffer - form-data accepts Buffer directly
      // Third parameter is filename (required for file uploads)
      formData.append('file', fileBuffer, fileName);

      // Get headers from form-data (includes Content-Type with boundary)
      // Don't override Content-Type - let form-data set it with boundary
      const formHeaders = formData.getHeaders();

      console.log(`📤 Uploading attachment to ${baseURL}/${moduleName}/${recordId}/Attachments`);
      console.log(`📄 File: ${fileName}, Size: ${fileBuffer.length} bytes`);

      const response = await axios.post(
        `${baseURL}/${moduleName}/${recordId}/Attachments`,
        formData,
        {
          headers: {
            ...formHeaders,
            Authorization: `Zoho-oauthtoken ${token}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      console.log(`✅ File uploaded successfully to ${moduleName}/${recordId}`);
      console.log(`📦 Upload response:`, JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error(`❌ Error uploading attachment to ${moduleName}/${recordId}:`, error.message);
      console.error('Error details:', error.response?.data || error);
      console.error('Error status:', error.response?.status);
      console.error('Error headers:', error.response?.headers);
      throw error;
    }
  }
}

// Export both the class and a singleton instance
export { ZohoCRMClient };
export default new ZohoCRMClient();
