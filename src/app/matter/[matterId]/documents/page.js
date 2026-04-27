"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, FileText } from "lucide-react";

export default function DocumentsPage() {
  const params = useParams();
  const matterId = params.matterId;
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDocs() {
      try {
        const res = await fetch(`/api/documents/${matterId}`);
        const data = await res.json();
        if (data.success) {
          setDocuments(data.documents || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDocs();
  }, [matterId]);

  const getStatusBadge = (status) => {
    const statusStyles = {
      'Pending': 'bg-gray-100 text-gray-700',
      'Not Submitted Yet': 'bg-purple-100 text-purple-700 border border-purple-300',
      'Uploaded': 'bg-blue-100 text-blue-700 border border-blue-300',
      'Awaiting Approval': 'bg-orange-100 text-orange-700 border border-orange-300',
      'Under Review': 'bg-yellow-100 text-yellow-700 border border-yellow-300',
      'Approved': 'bg-green-100 text-green-700 border border-green-300',
      'Rejected': 'bg-red-100 text-red-700 border border-red-300',
      'Declined': 'bg-red-100 text-red-700 border border-red-300',
    };
    
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[status] || statusStyles['Pending']}`}>
        {status || 'Pending'}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#285646]" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm text-center border border-gray-200">
        <p className="text-gray-500">No documents found for this matter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Uploaded Documents</h2>
        <p className="text-sm text-gray-500">Document status fetched from Zoho CRM.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 text-sm font-medium text-gray-900">Document Name</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-900">Status</th>
                <th className="py-3 px-4 text-sm font-medium text-gray-900">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map((doc, idx) => {
                const name = doc.Name || doc.Matter_Document_Name || doc.Document_Name || doc.File_Name || `Document ${doc.id?.slice(-6)}`;
                const status = doc.Document_Status || 'Pending';
                const comment = doc.Decline_Reason || doc.Comments || doc.Rejection_Comments || '';

                return (
                  <tr key={doc.id || idx} className="hover:bg-gray-50">
                    <td className="py-4 px-4 align-top">
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                        <span className="text-sm font-medium text-gray-900">{name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 align-top">
                      {getStatusBadge(status)}
                    </td>
                    <td className="py-4 px-4 align-top max-w-xs">
                      {comment ? (
                        <p className="text-sm text-gray-600 break-words">{comment}</p>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
