import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/alegreya/500.css";
import "@fontsource/alegreya/700.css";
import "./styles.css";
import "./play/play.css";
import "./ranks/ranks.css";
import "./layout/app-shell.css";
import "./figures/figure-set.css";
import "./replay/replay.css";
import "./profile/profile.css";
import "./friends/friends.css";
import "./lobby/waiting-room.css";
import "./leaderboard/leaderboard.css";
import "./admin/admin.css";
import "./i18n/localization.css";
import { updateDocumentLanguage } from "./i18n";
import { BrowserRouter } from "react-router";

updateDocumentLanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
