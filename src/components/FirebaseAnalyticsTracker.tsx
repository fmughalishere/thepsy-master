import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { logAnalyticsEvent } from "@/lib/firebase";

/**
 * Component that tracks page views automatically using React Router's location.
 * Should be placed inside a Router component.
 */
const FirebaseAnalyticsTracker = () => {
  const location = useLocation();

  useEffect(() => {
    try {
      // Log page_view event when route changes
      logAnalyticsEvent("page_view", {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
        page_title: document.title,
      });
      
      console.log(`[Analytics] Tracked page view: ${location.pathname}`);
    } catch (error) {
      console.error("[Analytics] Error tracking page view:", error);
    }
  }, [location]);

  return null;
};

export default FirebaseAnalyticsTracker;
