<script setup lang="ts">
import { PlBlockPage, PlBtnGhost, PlMaskIcon24, PlSlideModal } from "@platforma-sdk/ui-vue";
import { reactive } from "vue";
import { useApp } from "../app";
import SettingsPanel from "./SettingsPanel.vue";

const app = useApp();

const data = reactive<{ settingsOpen: boolean }>({
  settingsOpen: true,
});
</script>

<template>
  <PlBlockPage>
    <template #append>
      <PlBtnGhost @click.stop="() => (data.settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
  </PlBlockPage>
  <PlSlideModal v-model="data.settingsOpen" :shadow="true" :close-on-outside-click="true">
    <template #title>Settings</template>
    <SettingsPanel />
  </PlSlideModal>
</template>
