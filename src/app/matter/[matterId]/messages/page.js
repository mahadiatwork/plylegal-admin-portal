"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function MessagesPage() {
  const params = useParams();
  const matterId = params.matterId;
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchMsgs() {
      try {
        const res = await fetch(`/api/messages/${matterId}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.messages || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchMsgs();
  }, [matterId]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#285646]" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm text-center border border-gray-200">
        <p className="text-gray-500">No messages found for this matter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Communication History</h2>
        <p className="text-sm text-gray-500">Read-only view of all messages between applicant and Ply Legal.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-w-4xl mx-auto h-[600px] overflow-y-auto space-y-6">
        {messages.map((msg) => {
          const clientMessage = msg.Message_from_Client || '';
          const hasReply = msg.Reply_Message && msg.Reply_Message.trim() !== '';

          return (
            <div key={msg.id} className="space-y-4">
              {/* Client Message */}
              {clientMessage && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] lg:max-w-[70%]">
                    <div className="bg-[#285646] text-white rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm">
                      <p className="text-sm whitespace-pre-wrap">{clientMessage}</p>
                    </div>
                    <div className="text-xs text-gray-500 mt-1.5 text-right font-medium">
                      Applicant • {formatTimestamp(msg.Time_Sent)}
                    </div>
                  </div>
                </div>
              )}

              {/* Ply Legal Reply */}
              {hasReply && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] lg:max-w-[70%]">
                    <div className="bg-green-50 border border-green-200 text-gray-800 rounded-2xl rounded-tl-sm px-5 py-3 shadow-sm">
                      <p className="text-sm whitespace-pre-wrap">{msg.Reply_Message}</p>
                    </div>
                    <div className="text-xs text-gray-500 mt-1.5 font-medium">
                      Ply Legal • {formatTimestamp(msg.Time_Replied)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
