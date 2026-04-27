"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MessagesPage() {
  const params = useParams();
  const matterId = params.matterId;
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef(null);

  const fetchMsgs = async () => {
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
  };

  useEffect(() => {
    fetchMsgs();
  }, [matterId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/messages/${matterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setNewMessage("");
        await fetchMsgs(); // Refresh list
      } else {
        alert("Failed to send message: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Error sending message");
    } finally {
      setIsSending(false);
    }
  };

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

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto">
      <div className="mb-6 shrink-0">
        <h2 className="text-xl font-bold text-gray-900">Communication History</h2>
        <p className="text-sm text-gray-500">View and reply to messages between the applicant and Ply Legal.</p>
      </div>

      <div className="flex-1 min-h-0 bg-white border border-gray-200 rounded-t-xl shadow-sm overflow-hidden flex flex-col">
        {/* Messages List */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30"
        >
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              No messages yet. Start the conversation below.
            </div>
          ) : (
            messages.map((msg) => {
              const isClient = msg.senderType === 'client';
              const senderLabel = isClient
                ? (msg.senderName || 'Applicant')
                : (msg.senderName || 'Ply Legal');

              return (
                <div key={msg.id} className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%] lg:max-w-[70%]">
                    <div
                      className={
                        isClient
                          ? 'bg-[#285646] text-white rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm px-5 py-3 shadow-sm'
                      }
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                    </div>
                    <div className={`text-[10px] text-gray-400 mt-1.5 font-medium px-1 ${isClient ? 'text-right' : ''}`}>
                      {senderLabel} • {formatTimestamp(msg.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-100">
          <form 
            onSubmit={handleSendMessage}
            className="relative flex items-end gap-2"
          >
            <div className="flex-1 relative">
              <textarea
                rows={1}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type your reply..."
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#285646] focus:border-transparent resize-none transition-all"
                style={{ minHeight: '44px', maxHeight: '120px' }}
                disabled={isSending}
              />
            </div>
            <Button
              type="submit"
              disabled={!newMessage.trim() || isSending}
              className="rounded-full h-10 w-10 p-0 flex items-center justify-center shrink-0 bg-[#285646] hover:bg-[#1f4236]"
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5 ml-0.5" />
              )}
            </Button>
          </form>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Replies will be synced to the applicant's portal via Zoho CRM.
          </p>
        </div>
      </div>
    </div>
  );
}
