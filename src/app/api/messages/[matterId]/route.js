import { NextResponse } from 'next/server';
import { ZohoCRMClient } from '@/lib/zohoClient';
import { db } from '@/lib/firebase-admin';

async function resolveZohoId(matterId) {
  if (!db) return matterId;
  const appsRef = db.collection('applications');
  // 1. Try zohoId lookup
  const snapshot = await appsRef.where('zohoId', '==', matterId).get();
  if (!snapshot.empty) return matterId; // It's already a zohoId
  // 2. Try doc ID lookup to get zohoId
  const docSnap = await appsRef.doc(matterId).get();
  if (docSnap.exists && docSnap.data().zohoId) {
    return docSnap.data().zohoId;
  }
  return matterId; // Fallback
}

export async function GET(request, { params }) {
  try {
    const { matterId } = await params;

    if (!matterId) {
      return NextResponse.json({ success: false, error: 'Matter ID is required' }, { status: 400 });
    }

    const zohoId = await resolveZohoId(matterId);

    console.log(`🔍 Fetching Client_Messages for Deal ${zohoId}...`);
    const zohoClient = new ZohoCRMClient();
    
    const fields = 'id,Name,Message_from_Client,Reply_Message,Time_Sent,Time_Replied,Created_Time,Modified_Time';
    const messages = await zohoClient.getRelatedRecords('Deals', zohoId, 'Client_Messages', fields);

    const sortedMessages = (messages || []).sort((a, b) => {
      const timeA = a.Time_Sent || a.Created_Time || '';
      const timeB = b.Time_Sent || b.Created_Time || '';
      return timeA.localeCompare(timeB);
    });

    return NextResponse.json({ success: true, messages: sortedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch messages' }, { status: 500 });
  }
}
