import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminSession';
import { db, initResult } from '@/lib/firebase-admin';
import { calculateTemporaryWorkProgress, countTrueCompletionKeys } from '@/lib/questionnaireProgress';
import { getAllRoutes } from '@/lib/routes';
import { resolveMatterApplication } from '@/lib/matterResolver';
import { getBuiltInQuestionnaireDefinition } from '@/lib/questionnaireBuiltIns';
import { inferQuestionnaireAudience, loadQuestionnaireReviewDefinition } from '@/lib/questionnaireReviewDefinitions';
import { buildQuestionnaireAnswerGroups, calculateQuestionnaireAnswerProgress } from '@/lib/questionnaireAnswerModel';

export async function GET(request, { params }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ success: false, error: 'Admin session is required' }, { status: 401 });
  }

  try {
    // Await params since Next.js 15+ may have it async, or just destructure if earlier
    const { matterId } = await params;
    const searchParams = request?.nextUrl?.searchParams
      || new URL(request?.url || 'http://localhost').searchParams;
    const summaryOnly = searchParams.get('view') === 'summary';

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
      resolved = await resolveMatterApplication(
        db,
        matterId,
        summaryOnly ? undefined : { includeQuestionnaireData: true },
      );
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

    const appId = resolved.appId;
    const applicationData = {
      ...(resolved.application || resolved.appDoc.data()),
      id: appId,
    };

    // Remove any firebase-specific server timestamps from the payload.
    if (applicationData.createdAt?.toDate) applicationData.createdAt = applicationData.createdAt.toDate().toISOString();
    if (applicationData.updatedAt?.toDate) applicationData.updatedAt = applicationData.updatedAt.toDate().toISOString();

    if (summaryOnly) {
      return NextResponse.json({
        success: true,
        dataScope: 'summary',
        application: applicationData,
        percentage: null,
        progress: null,
        matchedBy: resolved.matchedBy,
        duplicateCount: resolved.duplicateCount || 1,
        duplicateIds: resolved.duplicateIds || [appId],
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const questionnaireData = resolved.questionnaire || {};
    const completionData = resolved.completion || {};
    const audience = inferQuestionnaireAudience(applicationData, questionnaireData);
    const builtInDefinition = getBuiltInQuestionnaireDefinition(audience);
    const questionnaireTemplate = await loadQuestionnaireReviewDefinition(db, audience, builtInDefinition);

    // Calculate percentage using the same section model as the client portal
    // for temporary-work questionnaires.
    let percentage = 0;
    const visaTypeCode = audience.visaType;
    const visaContext = audience.visaContext;
    let completedSections = 0;
    let totalSections = 0;
    
    if (questionnaireTemplate.definition?.pages?.length) {
      const progress = calculateQuestionnaireAnswerProgress(
        buildQuestionnaireAnswerGroups(questionnaireTemplate.definition, questionnaireData), completionData
      );
      completedSections = progress.completedSections;
      totalSections = progress.totalSections;
      percentage = progress.percentage;
    } else if (visaTypeCode === 'temporary-work') {
      const progress = calculateTemporaryWorkProgress(completionData, questionnaireData);
      completedSections = progress.completedSections;
      totalSections = progress.totalSections;
      percentage = progress.percentage;
    } else {
      // Legacy non-temporary-work calculation.
      const profiles = questionnaireData?.profiles || [];
      const allRoutes = getAllRoutes(visaTypeCode, visaContext, profiles);
      totalSections = allRoutes.length;
      completedSections = countTrueCompletionKeys(completionData);

      if (totalSections > 0) {
        percentage = Math.round((completedSections / totalSections) * 100);
        // Cap at 100% just in case there are extra keys
        if (percentage > 100) percentage = 100;
      }
    }

    return NextResponse.json({
      success: true,
      dataScope: 'full',
      application: applicationData,
      questionnaire: questionnaireData,
      questionnaireDefinition: questionnaireTemplate.definition || null,
      questionnaireDefinitionSource: questionnaireTemplate.source,
      completion: completionData,
      percentage,
      progress: {
        completedSections,
        totalSections,
      },
      matchedBy: resolved.matchedBy,
      duplicateCount: resolved.duplicateCount || 1,
      duplicateIds: resolved.duplicateIds || [appId],
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching matter data:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch matter data' }, { status: 500 });
  }
}
