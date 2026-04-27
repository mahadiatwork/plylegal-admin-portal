import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { ZohoCRMClient } from '@/lib/zohoClient';

// Resolve the Zoho Deal ID for a given matterId. The matterId may already be
// a Zoho Deal ID, or it may be a Firestore application doc id whose document
// holds the Zoho id under `zohoId`.
async function resolveZohoId(matterId) {
  if (!db) return matterId;
  try {
    const appsRef = db.collection('applications');
    // 1. matterId might already be a zohoId on an application doc
    const snap = await appsRef.where('zohoId', '==', matterId).limit(1).get();
    if (!snap.empty) return matterId;
    // 2. matterId might be a Firestore doc id -> read its zohoId
    const docSnap = await appsRef.doc(matterId).get();
    if (docSnap.exists && docSnap.data().zohoId) {
      return docSnap.data().zohoId;
    }
  } catch (err) {
    console.warn('⚠️ Failed to resolve Zoho id for matter:', err.message);
  }
  return matterId;
}

function toIsoString(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    // Zoho returns timestamps like "2026-04-28T10:15:00+10:00" already ISO-ish
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function GET(request, { params }) {
  try {
    const { matterId } = await params;

    if (!matterId) {
      return NextResponse.json({ success: false, error: 'Matter ID is required' }, { status: 400 });
    }

    const zohoId = await resolveZohoId(matterId);
    console.log(`🔍 Fetching Client_Messages for Deal ${zohoId}`);

    const zohoClient = new ZohoCRMClient();
    const records = await zohoClient.getRelatedRecords(
      'Deals',
      zohoId,
      'Client_Messages',
      'id,Name,Message_from_Client,Reply_Message,Time_Sent,Time_Replied,Created_Time,Modified_Time'
    );

    // Each Zoho Client_Messages record may carry both an inbound client
    // message and an outbound reply. We split them into chat bubbles so the
    // UI can render a conversation timeline.
    const messages = [];
    for (const r of records || []) {
      const sentAt = toIsoString(r.Time_Sent) || toIsoString(r.Created_Time);
      if (r.Message_from_Client) {
        messages.push({
          id: `${r.id}-client`,
          body: r.Message_from_Client,
          senderName: 'Applicant',
          senderType: 'client',
          createdAt: sentAt,
        });
      }
      if (r.Reply_Message) {
        messages.push({
          id: `${r.id}-reply`,
          body: r.Reply_Message,
          senderName: 'Ply Legal',
          senderType: 'admin',
          createdAt: toIsoString(r.Time_Replied) || toIsoString(r.Modified_Time) || sentAt,
        });
      }
    }

    messages.sort((a, b) => {
      const t1 = a.createdAt || '';
      const t2 = b.createdAt || '';
      return t1.localeCompare(t2);
    });

    return NextResponse.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages from Zoho:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const { matterId } = await params;
    const body = await request.json();
    const { message } = body;

    if (!matterId || !message) {
      return NextResponse.json({ success: false, error: 'Matter ID and message are required' }, { status: 400 });
    }

    const zohoId = await resolveZohoId(matterId);
    const zohoClient = new ZohoCRMClient();

    console.log(`✉️ Sending reply for Deal ${zohoId}`);

    // Create a new Client_Messages record related to this Deal
    // We set Reply_Message and Time_Replied to indicate it's an outbound message from admin
    const now = new Date().toISOString();
    
    // Note: Field names must match exactly what Zoho expects.
    // Based on the GET logic, these are the fields used.
    const result = await zohoClient.createRelatedRecord('Deals', zohoId, 'Client_Messages', {
      Name: `Reply - ${new Date().toLocaleString('en-AU')}`,
      Reply_Message: message,
      Time_Replied: now,
      // If we want to ensure it shows up correctly in the timeline, we might also set 
      // Time_Sent if the system uses that as a primary sort field.
      Time_Sent: now 
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error sending message to Zoho:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send message', details: error.message },
      { status: 500 }
    );
  }
}
