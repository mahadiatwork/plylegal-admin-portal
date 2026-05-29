import { NextResponse } from 'next/server';
import { db, initResult } from '@/lib/firebase-admin';
import { getAllRoutes } from '@/lib/routes';
import { resolveMatterApplication } from '@/lib/matterResolver';

export async function GET(request, { params }) {
  try {
    // Await params since Next.js 15+ may have it async, or just destructure if earlier
    const { matterId } = await params;

    if (!matterId) {
      return NextResponse.json({ success: false, error: 'Matter ID is required' }, { status: 400 });
    }

    if (!db) {
        console.error('Firebase Admin init failed:', initResult?.error);
        return NextResponse.json({ 
          success: false, 
          error: 'Database not initialized', 
          details: initResult?.error || 'Unknown error' 
        }, { status: 500 });
    }

    let resolved = null;

    try {
      resolved = await resolveMatterApplication(db, matterId);
    } catch (queryError) {
      console.error('Firestore query error:', queryError);
      return NextResponse.json({ 
        success: false, 
        error: 'Error querying database', 
        details: queryError.message 
      }, { status: 500 });
    }

    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Matter not found' }, { status: 404 });
    }

    const appsRef = db.collection('applications');
    const appDoc = resolved.appDoc;
    const appId = resolved.appId;

    // Fetch subcollections: questionnaire and completion
    const [questionnaireSnap, completionSnap] = await Promise.all([
      appsRef.doc(appId).collection('data').doc('questionnaire').get(),
      appsRef.doc(appId).collection('data').doc('completion').get(),
    ]);

    const applicationData = appDoc.data();
    applicationData.id = appDoc.id;
    
    const questionnaireData = questionnaireSnap.exists ? questionnaireSnap.data() : {};
    const completionData = completionSnap.exists ? completionSnap.data() : {};

    // Calculate percentage
    let percentage = 0;
    const visaTypeCode = applicationData.visaTypeCode?.toLowerCase() || 'partner'; // default fallback
    const visaContext = questionnaireData?.visaContext || null;
    
    // We get the total possible routes for this visa type
    const profiles = questionnaireData?.profiles || [];
    const allRoutes = getAllRoutes(visaTypeCode, visaContext, profiles);
    const totalSections = allRoutes.length;
    
    // Count only actual completed section flags. Metadata fields such as
    // updatedAt are truthy too and should not inflate the progress.
    const completedSections = Object.entries(completionData).filter(
      ([key, value]) => key !== 'updatedAt' && value === true
    ).length;
    
    if (totalSections > 0) {
      percentage = Math.round((completedSections / totalSections) * 100);
      // Cap at 100% just in case there are extra keys
      if (percentage > 100) percentage = 100;
    }

    // Remove any firebase-specific server timestamps from the payload
    if (applicationData.createdAt?.toDate) applicationData.createdAt = applicationData.createdAt.toDate().toISOString();
    if (applicationData.updatedAt?.toDate) applicationData.updatedAt = applicationData.updatedAt.toDate().toISOString();
    
    return NextResponse.json({
      success: true,
      application: applicationData,
      questionnaire: questionnaireData,
      completion: completionData,
      percentage,
    });
  } catch (error) {
    console.error('Error fetching matter data:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch matter data' }, { status: 500 });
  }
}
