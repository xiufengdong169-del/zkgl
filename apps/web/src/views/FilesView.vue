<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { callApi } from "../api";
import { cloudbaseApp } from "../cloudbase";

interface Project {
  id: string;
  projectName: string;
}
interface FileItem {
  id: string;
  logicalName: string;
  originalName: string;
  classification: string;
  sizeBytes: number;
  uploadedAt: string;
  currentVersion: number;
}
interface FileVersion {
  id: string;
  versionNumber: number;
  originalName: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
}
const projects = ref<Project[]>([]);
const projectId = ref("");
const items = ref<FileItem[]>([]);
const selected = ref<File | null>(null);
const replacement = ref<File | null>(null);
const selectedFile = ref<FileItem | null>(null);
const versions = ref<FileVersion[]>([]);
const classification = ref<"INTERNAL" | "SENSITIVE">("INTERNAL");
const loading = ref(false);
const error = ref<string | null>(null);
const route = useRoute();

onMounted(async () => {
  try {
    projects.value = (
      await callApi<{ items: Project[] }>("project.list", {
        page: 1,
        pageSize: 50,
      })
    ).items;
    const routeProjectId = route.query.projectId;
    if (typeof routeProjectId === "string") {
      projectId.value = routeProjectId;
      await load();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  }
});

async function load() {
  if (!projectId.value) {
    items.value = [];
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    items.value = (
      await callApi<{ items: FileItem[] }>("file.list", {
        businessType: "PROJECT",
        businessId: projectId.value,
      })
    ).items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function sha256(file: File) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  )
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function upload() {
  const file = selected.value;
  if (!file || !projectId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const prepared = await callApi<{ id: string; storageKey: string }>(
      "file.upload.prepare",
      {
        businessType: "PROJECT",
        businessId: projectId.value,
        projectId: projectId.value,
        logicalName: file.name,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        sha256: await sha256(file),
        classification: classification.value,
      },
    );
    const uploaded = await cloudbaseApp.uploadFile({
      cloudPath: prepared.storageKey,
      fileContent: file,
    });
    await callApi("file.upload.complete", {
      fileId: prepared.id,
      cloudFileId: uploaded.fileID,
    });
    selected.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "上传失败";
  } finally {
    loading.value = false;
  }
}

async function openHistory(file: FileItem) {
  selectedFile.value = file;
  replacement.value = null;
  error.value = null;
  try {
    versions.value = (
      await callApi<{ items: FileVersion[] }>("file.version.history", {
        fileId: file.id,
      })
    ).items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "版本历史加载失败";
  }
}

async function uploadVersion() {
  const file = replacement.value;
  if (!file || !selectedFile.value) return;
  loading.value = true;
  error.value = null;
  try {
    const prepared = await callApi<{
      fileId: string;
      versionId: string;
      storageKey: string;
    }>("file.version.prepare", {
      fileId: selectedFile.value.id,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      sha256: await sha256(file),
    });
    const uploaded = await cloudbaseApp.uploadFile({
      cloudPath: prepared.storageKey,
      fileContent: file,
    });
    await callApi("file.version.complete", {
      fileId: prepared.fileId,
      versionId: prepared.versionId,
      cloudFileId: uploaded.fileID,
    });
    replacement.value = null;
    await load();
    await openHistory({
      ...selectedFile.value,
      currentVersion: selectedFile.value.currentVersion + 1,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "新版本上传失败";
  } finally {
    loading.value = false;
  }
}

async function download(fileId: string, versionId: string | null = null) {
  error.value = null;
  try {
    const result = await callApi<{ url: string }>("file.download", {
      fileId,
      versionId,
    });
    window.open(result.url, "_blank", "noopener,noreferrer");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "下载失败";
  }
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">PRIVATE FILES</p>
        <h1>项目文件</h1>
      </div>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <section class="entity-form">
      <label
        >项目<select v-model="projectId" required @change="load">
          <option value="" disabled>请选择</option>
          <option
            v-for="project in projects"
            :key="project.id"
            :value="project.id"
          >
            {{ project.projectName }}
          </option>
        </select></label
      ><label
        >密级<select v-model="classification">
          <option value="INTERNAL">内部</option>
          <option value="SENSITIVE">敏感</option>
        </select></label
      ><label class="wide"
        >选择文件<input
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip"
          @change="
            selected = ($event.target as HTMLInputElement).files?.[0] ?? null
          " /></label
      ><button :disabled="loading || !selected || !projectId" @click="upload">
        {{ loading ? "处理中…" : "上传文件" }}
      </button>
    </section>
    <section class="data-list">
      <article v-for="file in items" :key="file.id" class="data-row">
        <div>
          <strong>{{ file.logicalName }} · V{{ file.currentVersion }}</strong>
          <p>
            {{ file.originalName }} ·
            {{ (Number(file.sizeBytes) / 1024).toFixed(1) }} KB ·
            {{ file.classification }}
          </p>
        </div>
        <div>
          <button class="secondary-button" @click="openHistory(file)">
            版本</button
          ><button class="secondary-button" @click="download(file.id)">
            下载最新版
          </button>
        </div>
      </article>
      <p v-if="projectId && !loading && !items.length">暂无文件</p>
    </section>
    <section v-if="selectedFile" class="data-panel">
      <header class="page-header">
        <div>
          <p class="eyebrow">VERSION HISTORY</p>
          <h2>{{ selectedFile.logicalName }}</h2>
        </div>
        <button @click="selectedFile = null">关闭</button>
      </header>
      <section class="entity-form">
        <label class="wide"
          >上传新版本<input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip"
            @change="
              replacement =
                ($event.target as HTMLInputElement).files?.[0] ?? null
            " /></label
        ><button :disabled="loading || !replacement" @click="uploadVersion">
          上传为新版本
        </button>
      </section>
      <table>
        <thead>
          <tr>
            <th>版本</th>
            <th>原始文件名</th>
            <th>大小</th>
            <th>上传时间</th>
            <th>摘要</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="version in versions" :key="version.id">
            <td>V{{ version.versionNumber }}</td>
            <td>{{ version.originalName }}</td>
            <td>{{ (Number(version.sizeBytes) / 1024).toFixed(1) }} KB</td>
            <td>{{ new Date(version.uploadedAt).toLocaleString() }}</td>
            <td>{{ version.sha256.slice(0, 12) }}…</td>
            <td>
              <button @click="download(selectedFile.id, version.id)">
                下载
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>
