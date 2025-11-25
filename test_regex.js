
const addTrackingToLinks = (htmlContent, campaignId, recipientId) => {
  const trackingUrls = [];
  let urlCounter = 0;

  // Regex to match URLs inside href attributes OR naked URLs
  // Group 1, 2, 3: href="url"
  // Group 4: naked url
  const regex = /(href\s*=\s*["'])(https?:\/\/[^\s"']+)(["'])|(https?:\/\/[^\s<>"']+)/gi;

  const modifiedContent = htmlContent.replace(
    regex,
    (match, hrefPrefix, hrefUrl, hrefSuffix, nakedUrl) => {
      urlCounter++;
      
      const originalUrl = hrefUrl || nakedUrl;
      if (!originalUrl) return match;

      const encodedUrl = encodeURIComponent(originalUrl);
      const trackingUrl = `TRACKING_URL?url=${encodedUrl}`;
      trackingUrls.push(trackingUrl);
      
      if (hrefUrl) {
        // Replace URL inside href
        return `${hrefPrefix}${trackingUrl}${hrefSuffix}`;
      } else {
        // Wrap naked URL in anchor tag to hide tracking link
        return `<a href="${trackingUrl}">${nakedUrl}</a>`;
      }
    }
  );

  return { content: modifiedContent, trackingUrls };
};

const input = `PrajwalPawar Resume - https://drive.google.com/file/d/1Z5Subqybafni0pwYeuOMkd8x15YHQW-9/view?usp=sharing

A few highlights from my recent work:`;

// Simulate personalizeContent (newlines to <br>)
const personalized = input.replace(/\n/g, '<br>');

const result = addTrackingToLinks(personalized, 'camp1', 'recip1');
console.log(result.content);
