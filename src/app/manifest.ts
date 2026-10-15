import type { MetadataRoute } from "next";

/**
 * Web app manifest. The share_target lets the installed app (Android "Add to
 * Home screen") appear in the Share sheet; shared job links open the job
 * capture page, which reads the link or asks for pasted text.
 */
export default function manifest(): MetadataRoute.Manifest {
  // share_target follows the Web Share Target spec ({ title, text, url }
  // params); Next's bundled type for it differs, hence the cast.
  return {
    name: "Avani",
    short_name: "Avani",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F4EFE5",
    theme_color: "#28352B",
    icons: [{ src: "/brand/mark-sun.svg", sizes: "any", type: "image/svg+xml" }],
    share_target: {
      action: "/jobs/capture",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  } as unknown as MetadataRoute.Manifest;
}
