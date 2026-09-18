export function guestLinkUrls(publicWebOrigin: string, token: string) {
  const guestUrl = `/guest/job/${encodeURIComponent(token)}`;
  return {
    guestUrl,
    shareUrl: new URL(guestUrl, `${publicWebOrigin}/`).href,
  };
}
