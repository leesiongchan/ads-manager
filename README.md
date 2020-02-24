# Ads Manager

Create Ads (Google Ads / Facebook Ads / Twitter Ads) with ease, period.

**NOTE: This library is very much opinionated, use it at your own risk. Making it an agnostic library is the ongoing plan, your help is very much needed to make this happen!**

**NOTE: All the price amounts are in `minor` unit, 1000 = \$10.00**

## Usage

```javascript
const facebookAdsChannel = new FacebookAdsChannel('facebook-ads', {
  accessToken: 'xxxx',
  adAccountId: 'yyyy',
});
facebookAdsChannel.setDefaultValues({
  adSet: {
    billingEvent: 'IMPRESSIONS',
  },
  campaign: {
    objective: 'LINK_CLICKS',
    specialAdCategory: 'NONE',
  },
  customAudience: {
    customerFileSource: 'PARTNER_PROVIDED_ONLY',
  },
});
const googleAdsChannel = new GoogleAdsChannel('google-ads', {
  clientId: 'xxxx',
  clientSecret: 'yyyy',
  customerAccountId: 'zzzz',
  developerToken: 'aaaa',
  refreshToken: 'bbbb',
});
googleAdsChannel.setDefaultValues({
  adGroupCriteria: {
    keywords: ['alien'],
  },
  campaignCriteria: {
    languageCodes: ['en_US'],
    locationCountryCodes: ['MY'],
  },
});
const twitterAdsChannel = new TwitterAdsChannel('twitter-ads', {
  accessTokenKey: 'xxxx',
  accessTokenSecret: 'yyyy',
  adAccountId: 'zzzz',
  consumerKey: 'aaaa',
  consumerSecret: 'bbbb',
});
twitterAdsChannel.setDefaultValues({
  tweet: {
    asUserId: 'dddd',
  },
});

const adsManager = new AdsManager({
  channels: [facebookAdsChannel, googleAdsChannel, twitterAdsChannel],
  logging: true,
});

adsManager.use<FacebookAdsChannel>('facebook-ads')?.createCampaign({
  adCreatives: [
    {
      headline: 'I am headline',
      description: 'I am desc',
      imageUrl: 'https://the-lib-will-automatically-download-and-convert-for-you.com',
      link: 'https://wherearethealiens.com',
      pageId: 'zzzz',
      text: 'I am text',
    },
  ],
  adSet: {
    bidAmount: 1000, // All the price amounts are in `minor` unit, 1000 = $10.00
    optimizationGoal: 'IMPRESSIONS',
    startTime: '2020-02-20',
    endTime: '2020-02-25',
  },
  campaign: {
    dailyBudget: 1000,
    lifetimeBudget: 10000,
  },
  customAudience: {
    description: 'I am custom audience desc',
  },
  name: 'My First Facebook Ads',
  status: 'ACTIVE',
});

adsManager.use<GoogleAdsChannel>('google-ads')?.createCampaign({
  adGroupAd: {
    businessName: 'dddd',
    descriptions: ['I am desc 1', 'I am desc 2'],
    headlines: ['I am headline 1', 'I am headline 2', 'I am headline 3'],
    imageUrls: ['https://the-lib-will-automatically-download-and-convert-for-you.com'],
    squareImageUrls: ['https://the-lib-will-automatically-download-and-convert-for-you-square.com'],
    url: 'https://wherearethealiens.com',
    displayUrlPaths: ['displaypath1', 'displaypath2'],
  },
  adGroupCriteria: {
    keywords: ['alien'],
  },
  campaign: {
    advertisingChannelType: 'DISPLAY',
    biddingStrategyConfig: { cpcBidCeilingAmount: 1000 },
    biddingStrategyType: 'TARGET_SPEND',
    endDate: '2020-01-05',
    startDate: '2020-01-01',
  },
  campaignBudget: {
    dailyAmount: 5000,
    totalAmount: 10000,
  },
  campaignCriteria: {
    languageCodes: ['en_US'],
    locationCountryCodes: ['MY'],
  },
  name: 'My First Google Ads',
  status: 'ENABLED',
});

adsManager.use<TwitterAdsChannel>('twitter-ads')?.createCampaign({
  campaign: {
    dailyBudget: 1000,
    fundingInstrumentId: 'cccc',
    endTime: '2020-01-05',
    startTime: '2020-01-01',
    totalBudget: 10000,
  },
  lineItem: {
    bidAmount: 1000,
  },
  name: 'My First Twitter Ads',
  status: 'ACTIVE',
  tailoredAudienceId: 'eeee',
  tweet: {
    asUserId: 'ffff',
    mediaUrls: ['https://the-lib-will-automatically-download-and-convert-for-you.com'],
    text: 'I am text',
  },
});
```

## Build your own channel

WIP

## TODO

- [x] Facebook Ads channel
- [x] Google Ads channel
- [x] Twitter Ads channel
- [ ] Better documentation
- [ ] Better typing
- [x] Add logs
- [ ] Add tests
- [ ] Add validations
- [ ] Check possible parameters for the chosen type, (eg. Google Ads: Search Type and Display Type have different set of bidding strategies)
- [ ] Revert strategy? If campaign failed to create, cascade delete!
