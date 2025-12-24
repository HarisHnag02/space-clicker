# 📢 Ad Monetization Integration Guide

## Overview
Your Space Clicker game now includes a complete ad monetization framework with placeholders for:
- **Banner Ads** (Multiple positions)
- **Rewarded Video Ads** (Watch-to-Earn)
- **Interstitial Ads** (Full-screen between actions)

## Ad Placements

### 1. Banner Ads (4 positions)

#### Left Sidebar Banner
- **Element ID**: `left-banner-ad`
- **Size**: 200x250 (Medium Rectangle)
- **Best for**: Google AdSense, Media.net

#### Right Sidebar Banner #1
- **Element ID**: `right-banner-ad-1`
- **Size**: 300x250 (Medium Rectangle)
- **Best for**: High-value ad networks

#### Right Sidebar Banner #2
- **Element ID**: `right-banner-ad-2`
- **Size**: 300x100 (Small Banner)
- **Best for**: Supplementary income

#### Bottom Banner (Desktop only)
- **Element ID**: `bottom-banner-ad`
- **Size**: 728x90 (Leaderboard)
- **Best for**: Google AdSense horizontal ads
- **Note**: Hidden on mobile for better UX

### 2. Rewarded Video Ads

**Location**: Left sidebar "Bonus Rewards" section  
**Trigger**: Player clicks "Watch Ad" button  
**Reward**: +200% particle income for 60 seconds  
**Cooldown**: 2 minutes between ads  

**Code Location**: `script.js` → `showRewardedAd()` function

### 3. Interstitial Ads

**Triggers**:
- Every 5 tier unlocks
- Every prestige action

**Features**:
- 5-second forced viewing
- Full-screen overlay
- Close button appears after countdown

**Code Location**: `script.js` → `showInterstitialAd()` function

## Integration Steps

### Option 1: Google AdSense (Easiest)

1. **Sign up**: https://www.google.com/adsense
2. **Get your Publisher ID**
3. **Replace placeholders**:

```html
<!-- In index.html, replace this: -->
<div class="ad-placeholder">
    <div class="ad-content">AD SPACE<br>300x250</div>
</div>

<!-- With AdSense code: -->
<ins class="adsbygoogle"
     style="display:inline-block;width:300px;height:250px"
     data-ad-client="ca-pub-XXXXXXXXXX"
     data-ad-slot="YYYYYYYYYY"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```

### Option 2: Unity Ads (For Games)

1. **Install Unity Ads SDK**:
```html
<!-- Add to index.html <head> -->
<script src="https://cdn.unity3d.com/unity-ads/latest/unity-ads.min.js"></script>
```

2. **Initialize** (in script.js init function):
```javascript
UnityAds.initialize('YOUR_GAME_ID', true); // true = test mode
```

3. **Replace rewarded ad function**:
```javascript
function showRewardedAd() {
    UnityAds.show('rewardedVideo', {
        onComplete: () => grantAdReward(),
        onSkipped: () => console.log('Ad skipped'),
        onError: (error) => console.error('Ad error:', error)
    });
}
```

4. **Replace interstitial function**:
```javascript
function showInterstitialAd() {
    UnityAds.show('interstitial');
}
```

### Option 3: AdMob (Mobile Web)

1. **Add AdMob script**:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXX"
     crossorigin="anonymous"></script>
```

2. **Use responsive ad units** for mobile-first design

### Option 4: Other Networks

- **AppLovin**: https://www.applovin.com/
- **IronSource**: https://www.is.com/
- **AdColony**: https://www.adcolony.com/
- **Vungle**: https://vungle.com/

## Testing

### Test Mode
All ad networks support test mode. Enable it during development:

```javascript
// Example for Unity Ads
UnityAds.initialize('YOUR_GAME_ID', true); // true = test mode
```

### Verify Ad Triggers
1. **Rewarded**: Click "Watch Ad" button
2. **Interstitial**: Unlock 5 tiers or prestige once
3. **Banners**: Visible on page load

## Revenue Optimization Tips

1. **Don't overdo it**: Too many ads hurt retention
2. **Value rewarded ads**: Players love them - best engagement
3. **Frequency capping**: Implemented (2min cooldown for rewarded, 2min for interstitials)
4. **Mobile-first**: Bottom banner hidden on mobile for better UX
5. **A/B test**: Try different ad placements and networks

## Analytics Integration

Track ad performance in your analytics:

```javascript
// Example: Google Analytics
gtag('event', 'rewarded_ad_completed', {
    'event_category': 'monetization',
    'event_label': 'particles_bonus'
});
```

**Integration points in code**:
- `grantAdReward()` - Rewarded ad completed
- `showInterstitialAd()` - Interstitial shown
- Search for `console.log('📊 Analytics:` in script.js

## Current Placeholder System

All ads show placeholders with:
- Dashed borders
- Ad size labels
- Dark gradient background

**To activate real ads**: Replace the `.ad-placeholder` div content with your ad network's code.

## Support

- Check `script.js` for detailed integration comments
- Each ad function has REAL AD INTEGRATION POINT markers
- All ad logic is in the "AD MONETIZATION SYSTEM" section

## Next Steps

1. Choose your ad network(s)
2. Sign up and get credentials
3. Replace placeholders with real ad code
4. Enable test mode
5. Test thoroughly
6. Switch to production mode
7. Monitor revenue and adjust

Good luck with monetization! 🚀💰

