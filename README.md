# Ads Manager

Create Ads (Google Ads / Facebook Ads / Twitter Ads) with ease, period.

**NOTE: This library is very much opinionated, use it at your own risk. Making it an agnostic library is the ongoing plan, your help is very much needed to make this happen!**

**NOTE: All the price amounts are in `micro` unit, 1000 = \$10.00**

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

const adsManager = new AdsManager({
  channels: [facebookAdsChannel],
  // debug: true, // WIP
});

await adsManager.use<FacebookAdsChannel>('facebook-ads')?.createCampaign({
  adCreatives: [
    {
      headline: 'I am headline',
      description: 'I am description',
      imageUrl: 'https://the-lib-will-automatically-download-and-convert-for-you.com',
      link: 'https://wherearethealiens.com',
      pageId: 'zzzz',
      text: 'I am test',
    },
  ],
  adSet: {
    bidAmount: 1000, // All the price amounts are in `micro` unit, 1000 = $10.00
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
  name: 'My First Ads',
  status: 'ACTIVE',
});
```

## Build your own channel

WIP

## TODO

- [x] Facebook Ads channel
- [ ] Google Ads channel
- [ ] Twitter Ads channel
- [ ] Better documentation
- [ ] Better typing
- [ ] Add logs
- [ ] Add tests
- [ ] Add validations
- [ ] Check possible parameters for the chosen type, (eg. Google Ads: Search Type and Display Type have different set of bidding strategies)
- [ ] Revert strategy? If campaign failed to create, cascade delete!
