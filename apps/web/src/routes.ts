import type { RouteRecordRaw } from "vue-router";

export const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("./views/LoginView.vue"),
  },
  {
    path: "/",
    name: "home",
    component: () => import("./views/HomeView.vue"),
  },
  {
    path: "/customers",
    name: "customers",
    meta: { permission: "crm.counterparty.read" },
    component: () => import("./views/CustomersView.vue"),
  },
  {
    path: "/leads",
    name: "leads",
    meta: { permission: "lead.read" },
    component: () => import("./views/LeadsView.vue"),
  },
  {
    path: "/projects",
    name: "projects",
    meta: { permission: "project.read" },
    component: () => import("./views/ProjectsView.vue"),
  },
  {
    path: "/approvals",
    name: "approvals",
    meta: { permission: "approval.task.read" },
    component: () => import("./views/ApprovalsView.vue"),
  },
  {
    path: "/bids",
    name: "bids",
    meta: { permission: "bid.application.read" },
    component: () => import("./views/BidsView.vue"),
  },
  {
    path: "/contracts",
    name: "contracts",
    meta: { permission: "contract.read" },
    component: () => import("./views/ContractsView.vue"),
  },
  {
    path: "/delivery",
    name: "delivery",
    meta: { permission: "project.delivery.read" },
    component: () => import("./views/DeliveryView.vue"),
  },
  {
    path: "/finance",
    name: "finance",
    meta: { permission: "finance.read" },
    component: () => import("./views/FinanceView.vue"),
  },
  {
    path: "/settlements",
    name: "settlements",
    meta: { permission: "settlement.read" },
    component: () => import("./views/SettlementsView.vue"),
  },
  {
    path: "/files",
    name: "files",
    meta: { permission: "file.read" },
    component: () => import("./views/FilesView.vue"),
  },
  {
    path: "/admin",
    name: "admin",
    meta: { permission: "system.admin" },
    component: () => import("./views/AdminView.vue"),
  },
  {
    path: "/reports",
    name: "reports",
    meta: { permission: "report.financial.read" },
    component: () => import("./views/ReportsView.vue"),
  },
];
