export const facebookAdSchema = {
  properties: {
    imageUrl: { format: 'uri', type: 'string' },
    name: { type: 'string' },
    pageId: { type: 'string' },
    callToActionType: { type: 'string' },
    description: { type: 'string' },
    link: { format: 'uri', type: 'string' },
    headline: { type: 'string' },
    text: { type: 'string' },
  },
  type: 'object',
};

export const facebookAdSetSchema = {
  properties: {
    billingEvent: { enum: ['CLICKS', 'IMPRESSIONS', 'LINK_CLICKS'] },
    campaignId: { type: 'string' },
    customAudienceId: { type: 'string' },
    name: { type: 'string' },
    optimizationGoal: { enum: ['IMPRESSIONS', 'LINK_CLICKS', 'REACH'] },
    startTime: { type: 'string' },
    status: { type: ['ACTIVE', 'ARCHIVED', 'DELETED', 'PAUSED'] },
  },
};

export const facebookCampaignSchema = {
  properties: {
    dailyBudget: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
    lifetimeBudget: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
    name: { type: 'string' },
    objective: { enum: ['LINK_CLICKS', 'REACH'] },
    specialAdCategory: { enum: ['NONE'] },
    status: { enum: ['ACTIVE', 'ARCHIVED', 'DELETED', 'PAUSED'] },
  },
  type: 'object',
};
