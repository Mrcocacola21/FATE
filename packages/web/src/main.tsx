import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./layout/app-shell.css";
import "./figures/figure-set.css";
import "./replay/replay.css";
import "./statistics/statistics.css";
import { getLanguage } from "./i18n";
import { BrowserRouter } from "react-router";

document.documentElement.lang = getLanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
