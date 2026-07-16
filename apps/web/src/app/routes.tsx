import { createBrowserRouter } from "react-router";
import HomePage from "./pages/HomePage";
import TreePage from "./pages/TreePage";
import BirthdayPage from "./pages/BirthdayPage";
import TimelinePage from "./pages/TimelinePage";
import ProfilePage from "./pages/ProfilePage";
import Layout from "./components/Layout";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "tree", Component: TreePage },
      { path: "birthday", Component: BirthdayPage },
      { path: "timeline", Component: TimelinePage },
      { path: "profile", Component: ProfilePage },
    ],
  },
]);
