import { createBrowserRouter } from "react-router";
import Layout from "./components/Layout";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./pages/HomePage")).default }) },
      { path: "tree", lazy: async () => ({ Component: (await import("./pages/TreePage")).default }) },
      { path: "birthday", lazy: async () => ({ Component: (await import("./pages/BirthdayPage")).default }) },
      { path: "timeline", lazy: async () => ({ Component: (await import("./pages/TimelinePage")).default }) },
      { path: "profile", lazy: async () => ({ Component: (await import("./pages/ProfilePage")).default }) },
    ],
  },
]);
