import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { hasPermission } from "./navigation";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
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
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.name === "login") return auth.authenticated ? { name: "home" } : true;
  try {
    const user = await auth.ensureSession();
    const permission = to.meta.permission as string | undefined;
    if (!hasPermission(user.permissionCodes, permission))
      return { name: "home", query: { denied: to.fullPath } };
    return true;
  } catch {
    return { name: "login", query: { redirect: to.fullPath } };
  }
});
