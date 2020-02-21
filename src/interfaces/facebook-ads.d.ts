export type FacebookCampaignStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';
export type FacebookAdSetStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';
export type FacebookAdStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';

export interface FacebookAdData {
  adCreativeId: string;
  adSetId: string;
  name: string;
  status: FacebookAdStatus;
}

export interface FacebookAdCreativeData {
  name: string;
  pageId: string;
  callToActionType?: string;
  description?: string;
  imageHash: string;
  link: string;
  headline: string;
  message: string;
}

export interface FacebookAdSetData {
  bidAmount: number;
  campaignId: string;
  customAudienceId?: string;
  endTime?: string;
  name: string;
  optimizationGoal: string;
  startTime: string;
  status: FacebookAdSetStatus;
}

export interface FacebookCampaignData {
  dailyBudget: number;
  lifetimeBudget?: number;
  name: string;
  status: FacebookCampaignStatus;
}

export interface FacebookCustomAudienceData {
  description?: string;
  name: string;
}
