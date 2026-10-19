<script lang="ts">
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
  let { status } = $derived(data);
</script>

<div>{status}</div>

<style>
</style>
