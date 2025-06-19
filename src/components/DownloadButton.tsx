import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import useDownloader from "react-use-downloader";
import { ReactNode } from "react";
import { logAnalyticsEvent } from "@/server/analytics";
import type { ImageData } from "@/server/imageData";

export function DownloadButton(props: {
  image: ImageData;
  children?: ReactNode;
}) {
  const { download, isInProgress } = useDownloader();

  function handleDownload() {
    logAnalyticsEvent({
      data: {
        eventType: "imageDownloaded",
        payload: {
          id: props.image.id,
        },
      },
    });
    download(props.image.url, props.image.url.split("/").pop() || "cover");
  }

  return (
    <Button className="w-full" onClick={handleDownload} disabled={isInProgress}>
      {props.children ? (
        props.children
      ) : (
        <>
          <span>{isInProgress ? "Downloading..." : "Download"}</span>
          <Download />
        </>
      )}
    </Button>
  );
}
