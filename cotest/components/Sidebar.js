/**
 * Sidebar.js — mock component module (CommonJS export).
 * This file only exists to prove multi-directory tooling capabilities.
 */

"use strict";

/**
 * Mock function: returns the navigation items a real Sidebar would render.
 * @returns {Array<{id: string, label: string, icon: string}>}
 */
function getNavItems() {
  return [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "analytics", label: "Analytics", icon: "◈" },
    { id: "campaigns", label: "Campaigns", icon: "◉" },
    { id: "customers", label: "Customers", icon: "▤" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];
}

/** Mock function: returns the default sidebar state. */
function getDefaultState() {
  return { collapsed: false, open: false };
}

module.exports = {
  getNavItems,
  getDefaultState,
};
