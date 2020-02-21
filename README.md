# Ads Manager

Create Ads (Google Ads / Facebook Ads / Twitter Ads) with ease, period.

**NOTE: This library is very much opinionated, use it at your own risk. Making it an agnostic library is the ongoing plan, your help is very much needed to make this happen!**

## Usage

```javascript
const facebookAdsChannel = new FacebookAdsChannel('facebook-ads', {
  accessToken: 'xxxx';
  adAccountId: 'yyyy';
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
});

adsManager.use('facebook-ads').createCampaign({
  adCreatives: [{

  }],
  adSet: {

  },
  campaign: {

  },
  customAudience: {

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
