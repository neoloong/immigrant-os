import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Immigrant OS",
    short_name: "ImmigrantOS",
    description: "Your immigration journey, organized.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbf8",
    theme_color: "#174f3e",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
