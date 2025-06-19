import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import useDownloader from "react-use-downloader";
import { ReactNode } from "react";

export function DownloadButton(props: { url: string; children?: ReactNode }) {
  const { download, isInProgress } = useDownloader();

  return (
    <Button
      className="w-full"
      onClick={() => download(props.url, props.url.split("/").pop() || "cover")}
      disabled={isInProgress}
    >
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
