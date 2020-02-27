export type FacebookAdStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';
export type FacebookAdCreativeCallToActionType =
  | 'ADD_TO_CART'
  | 'APPLY_NOW'
  | 'BOOK_TRAVEL'
  | 'BUY'
  | 'BUY_NOW'
  | 'BUY_TICKETS'
  | 'CALL'
  | 'CALL_ME'
  | 'CONTACT'
  | 'CONTACT_US'
  | 'DONATE'
  | 'DONATE_NOW'
  | 'DOWNLOAD'
  | 'EVENT_RSVP'
  | 'FIND_A_GROUP'
  | 'FIND_YOUR_GROUPS'
  | 'FOLLOW_NEWS_STORYLINE'
  | 'GET_DIRECTIONS'
  | 'GET_OFFER'
  | 'GET_OFFER_VIEW'
  | 'GET_QUOTE'
  | 'GET_SHOWTIMES'
  | 'INSTALL_APP'
  | 'INSTALL_MOBILE_APP'
  | 'LEARN_MORE'
  | 'LIKE_PAGE'
  | 'LISTEN_MUSIC'
  | 'LISTEN_NOW'
  | 'MESSAGE_PAGE'
  | 'MOBILE_DOWNLOAD'
  | 'MOMENTS'
  | 'NO_BUTTON'
  | 'OPEN_LINK'
  | 'ORDER_NOW'
  | 'PLAY_GAME'
  | 'RECORD_NOW'
  | 'SAY_THANKS'
  | 'SEE_MORE'
  | 'SELL_NOW'
  | 'SHARE'
  | 'SHOP_NOW'
  | 'SIGN_UP'
  | 'SOTTO_SUBSCRIBE'
  | 'SUBSCRIBE'
  | 'UPDATE_APP'
  | 'USE_APP'
  | 'USE_MOBILE_APP'
  | 'VIDEO_ANNOTATION'
  | 'VISIT_PAGES_FEED'
  | 'WATCH_MORE'
  | 'WATCH_VIDEO'
  | 'WHATSAPP_MESSAGE'
  | 'WOODHENGE_SUPPORT';
export type FacebookAdSetBillingEvent = 'CLICKS' | 'IMPRESSIONS' | 'LINK_CLICKS';
export type FacebookAdSetOptimizationGoal = 'IMPRESSIONS' | 'LINK_CLICKS' | 'REACH';
export type FacebookAdSetStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';
export type FacebookCampaignObjective = 'LINK_CLICKS' | 'REACH';
export type FacebookCampaignStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED';
export type FacebookCustomAudienceCustomerFileSource =
  | 'BOTH_USER_AND_PARTNER_PROVIDED'
  | 'PARTNER_PROVIDED_ONLY'
  | 'USER_PROVIDED_ONLY';

export interface FacebookAdData {
  adCreativeId: string;
  adSetId: string;
  name: string;
  status: FacebookAdStatus;
}

export interface FacebookAdCreativeData {
  name?: string;
  pageId: string;
  callToActionType?: FacebookAdCreativeCallToActionType;
  description?: string;
  imageHash: string;
  link: string;
  headline?: string;
  text: string;
}

export interface FacebookAdSetData {
  bidAmount?: number;
  billingEvent: FacebookAdSetBillingEvent;
  campaignId: string;
  customAudienceId: string;
  endTime?: string;
  name: string;
  optimizationGoal: FacebookAdSetOptimizationGoal;
  startTime: string;
  status: FacebookAdSetStatus;
}

export interface FacebookCampaignData {
  dailyBudget?: number;
  lifetimeBudget?: number;
  name: string;
  objective: FacebookCampaignObjective;
  specialAdCategory: 'NONE';
  status: FacebookCampaignStatus;
}

export interface FacebookCustomAudienceData {
  customerFileSource: FacebookCustomAudienceCustomerFileSource;
  description?: string;
  name: string;
  subtype: 'CUSTOM';
}
