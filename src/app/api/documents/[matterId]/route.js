import { NextResponse } from 'next/server';
import { ZohoCRMClient } from '@/lib/zohoClient';
import { db } from '@/lib/firebase-admin';

async function resolveZohoId(matterId) {
  if (!db) return matterId;
  const appsRef = db.collection('applications');
  const snapshot = await appsRef.where('zohoId', '==', matterId).get();
  if (!snapshot.empty) return matterId;
  const docSnap = await appsRef.doc(matterId).get();
  if (docSnap.exists && docSnap.data().zohoId) {
    return docSnap.data().zohoId;
  }
  return matterId;
}

export async function GET(request, { params }) {
  try {
    const { matterId } = await params;

    if (!matterId) {
      return NextResponse.json({ success: false, error: 'Matter ID is required' }, { status: 400 });
    }

    const zohoId = await resolveZohoId(matterId);

    console.log(`🔍 Fetching Documents for Deal ${zohoId}...`);
    const zohoClient = new ZohoCRMClient();
    
    // Fetch documents and documents_json concurrently
    const [documents, deal] = await Promise.all([
      zohoClient.getRelatedRecords(
        'Deals', 
        zohoId, 
        'Matter_Documents', 
        'id,Matter_Document_Name,Document_Name,Name,Document_Status,Created_Time,File_Name,File_Size,Modified_Time,Owner,Parent_Id,document_Serial,Comments,Rejection_Comments,Decline_Reason'
      ),
      zohoClient.getRecord('Deals', zohoId, 'id,documents_json,Documents_JSON')
    ]);

    const sortedDocuments = (documents || []).sort((a, b) => {
      const serialA = a.document_Serial || a.Document_Serial;
      const serialB = b.document_Serial || b.Document_Serial;
      
      if (serialA !== null && serialA !== undefined && serialB !== null && serialB !== undefined) {
        return Number(serialA) - Number(serialB);
      }
      if (serialA !== null && serialA !== undefined) return -1;
      if (serialB !== null && serialB !== undefined) return 1;
      return 0;
    });

    const documentsJson = deal?.documents_json || deal?.Documents_JSON || null;

    return NextResponse.json({
      success: true,
      documents: sortedDocuments,
      categorization: documentsJson ? (typeof documentsJson === 'string' ? JSON.parse(documentsJson) : documentsJson) : null
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch documents' }, { status: 500 });
  }
}
