import { createApp, ref, reactive, computed, onMounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

const SOURCE_OPTIONS = [
  { label: "酷我", value: "kuwo" },
  { label: "网易云", value: "netease" },
  { label: "QQ 音乐", value: "qq" },
];

const QUALITY_OPTIONS = [
  { label: "128k", value: "128k" },
  { label: "320k", value: "320k" },
  { label: "flac", value: "flac" },
  { label: "flac24bit", value: "flac24bit" },
];

const TOPLIST_PREVIEW_COUNT = 8;
const SEARCH_PAGE_SIZE = 10;

const App = {
  setup() {
    const activeTab = ref("search");
    const resultMode = ref("none");
    const source = ref("kuwo");
    const keyword = ref("");
    const page = ref(1);
    const hasSearchResult = ref(false);

    const loading = ref(false);
    const searching = ref(false);
    const msg = reactive({ text: "", error: "" });

    const songs = ref([]);
    const toplists = ref([]);
    const currentToplist = ref(null);
    const showAllToplists = ref(false);

    const playlistId = ref("");
    const playlistInfo = ref(null);

    const parseState = reactive({});
    const directParse = reactive({
      id: "",
      quality: "320k",
      loading: false,
      url: "",
      actualQuality: "",
      error: "",
    });

    const canSearch = computed(() => keyword.value.trim().length > 0 && !searching.value);
    const canPrevPage = computed(() => hasSearchResult.value && page.value > 1 && !searching.value);
    const canNextPage = computed(() => hasSearchResult.value && songs.value.length === SEARCH_PAGE_SIZE && !searching.value);
    const visibleToplists = computed(() => {
      if (showAllToplists.value) return toplists.value;
      return toplists.value.slice(0, TOPLIST_PREVIEW_COUNT);
    });
    const sourceLabel = computed(() => SOURCE_OPTIONS.find((item) => item.value === source.value)?.label || source.value);
    const resultTitle = computed(() => {
      if (currentToplist.value?.name) return `榜单：${currentToplist.value.name}`;
      if (playlistInfo.value?.name) return `歌单：${playlistInfo.value.name}`;
      return "搜索结果";
    });

    function switchTab(tab) {
      activeTab.value = tab;
      msg.error = "";
      if (tab === "rank" && toplists.value.length === 0) {
        fetchToplists();
      }
    }

    async function request(path, params = {}, method = "GET", body = null) {
      const url = new URL(path, window.location.origin);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      });

      const options = { method };
      if (body) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
      }

      const res = await fetch(url.toString(), options);
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || `请求失败: ${res.status}`);
      }
      return data.data;
    }

    async function fetchToplists() {
      loading.value = true;
      msg.error = "";
      try {
        const data = await request("/api/toplists", { source: source.value });
        toplists.value = Array.isArray(data) ? data : [];
        showAllToplists.value = false;
      } catch (err) {
        msg.error = err.message;
      } finally {
        loading.value = false;
      }
    }

    async function searchSongs(targetPage = 1) {
      if (!keyword.value.trim()) {
        msg.error = "请输入歌曲关键词";
        return;
      }

      const nextPage = Number(targetPage);
      if (!Number.isFinite(nextPage) || nextPage < 1) return;

      page.value = nextPage;
      resultMode.value = "search";
      searching.value = true;
      msg.text = "";
      msg.error = "";
      currentToplist.value = null;
      playlistInfo.value = null;
      activeTab.value = "search";

      try {
        const data = await request("/api/search", {
          source: source.value,
          keyword: keyword.value.trim(),
          page: page.value,
          limit: SEARCH_PAGE_SIZE,
        });

        songs.value = Array.isArray(data) ? data : [];
        hasSearchResult.value = songs.value.length > 0 || page.value > 1;

        if (songs.value.length === 0) {
          msg.text = page.value > 1 ? `第 ${page.value} 页没有结果，可以返回上一页` : "没有搜索到结果，请换关键词再试";
        } else {
          const differentSource = songs.value.some((item) => item.source && item.source !== source.value);
          msg.text = differentSource
            ? `找到 ${songs.value.length} 条（第 ${page.value} 页，平台已自动切换）`
            : `找到 ${songs.value.length} 条（第 ${page.value} 页）`;
          scrollToSongs();
        }
      } catch (err) {
        hasSearchResult.value = false;
        msg.error = err.message;
      } finally {
        searching.value = false;
      }
    }

    function searchFirstPage() {
      searchSongs(1);
    }

    function prevPage() {
      if (!canPrevPage.value) return;
      searchSongs(page.value - 1);
    }

    function nextPage() {
      if (!canNextPage.value) return;
      searchSongs(page.value + 1);
    }

    async function fetchToplistSongs(item) {
      if (!item?.id) return;

      resultMode.value = "rank";
      loading.value = true;
      msg.error = "";
      msg.text = "";
      playlistInfo.value = null;
      hasSearchResult.value = false;
      page.value = 1;
      activeTab.value = "rank";

      try {
        const data = await request("/api/toplist", { source: source.value, id: item.id });
        songs.value = Array.isArray(data) ? data : [];
        currentToplist.value = item;
        msg.text = `已加载榜单：${item.name}`;
        scrollToSongs();
      } catch (err) {
        msg.error = err.message;
      } finally {
        loading.value = false;
      }
    }

    async function fetchPlaylist() {
      const id = playlistId.value.trim();
      if (!id) {
        msg.error = "请输入歌单 ID";
        return;
      }

      resultMode.value = "id";
      loading.value = true;
      msg.text = "";
      msg.error = "";
      currentToplist.value = null;
      hasSearchResult.value = false;
      page.value = 1;
      activeTab.value = "id";

      try {
        const data = await request("/api/playlist", { source: source.value, id });
        if (!data) throw new Error("未获取到歌单数据");
        playlistInfo.value = data.info || null;
        songs.value = Array.isArray(data.list) ? data.list : [];
        msg.text = `已加载歌单：${playlistInfo.value?.name || id}`;
        scrollToSongs();
      } catch (err) {
        msg.error = err.message;
      } finally {
        loading.value = false;
      }
    }

    function parseKey(song) {
      const realSource = song?.source || source.value;
      return `${realSource}:${song.id}`;
    }

    function getParseItem(song) {
      const key = parseKey(song);
      if (!parseState[key]) {
        parseState[key] = {
          loading: false,
          quality: "320k",
          url: "",
          actualQuality: "",
          error: "",
        };
      }
      return parseState[key];
    }

    async function parseSong(song) {
      const state = getParseItem(song);
      const realSource = song?.source || source.value;
      state.loading = true;
      state.error = "";
      state.url = "";
      state.actualQuality = "";

      try {
        const data = await request("/api/parse", {
          source: realSource,
          id: song.id,
          quality: state.quality,
        });

        const item = data?.data?.[0] || null;
        if (!item?.url) {
          throw new Error(item?.error || "该歌曲暂时无法解析播放链接");
        }

        state.url = item.url;
        state.actualQuality = item.actualQuality || item.requestedQuality || "";
      } catch (err) {
        state.error = err.message;
      } finally {
        state.loading = false;
      }
    }

    function downloadSong(song) {
      const state = getParseItem(song);
      if (!state.url) {
        state.error = "请先点击“试听/解析”";
        return;
      }
      window.open(state.url, "_blank");
    }

    async function parseById() {
      const id = directParse.id.trim();
      if (!id) {
        directParse.error = "请输入音乐 ID";
        return;
      }

      directParse.loading = true;
      directParse.error = "";
      directParse.url = "";
      directParse.actualQuality = "";

      try {
        const data = await request("/api/parse", {
          source: source.value,
          id,
          quality: directParse.quality,
        });
        const item = data?.data?.[0] || null;
        if (!item?.url) throw new Error(item?.error || "该 ID 暂时无法解析");
        directParse.url = item.url;
        directParse.actualQuality = item.actualQuality || item.requestedQuality || "";
      } catch (err) {
        directParse.error = err.message;
      } finally {
        directParse.loading = false;
      }
    }

    function downloadById() {
      if (!directParse.url) {
        directParse.error = "请先解析 ID，再下载";
        return;
      }
      window.open(directParse.url, "_blank");
    }

    function scrollToSongs() {
      setTimeout(() => {
        const el = document.getElementById("results-area");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }

    function resetForSource() {
      songs.value = [];
      resultMode.value = "none";
      page.value = 1;
      hasSearchResult.value = false;
      currentToplist.value = null;
      playlistInfo.value = null;
      msg.text = "";
      msg.error = "";
      directParse.id = "";
      directParse.url = "";
      directParse.error = "";
      fetchToplists();
    }

    onMounted(() => {
      fetchToplists();
    });

    return {
      SOURCE_OPTIONS,
      QUALITY_OPTIONS,
      TOPLIST_PREVIEW_COUNT,
      activeTab,
      resultMode,
      source,
      sourceLabel,
      keyword,
      page,
      hasSearchResult,
      loading,
      searching,
      msg,
      songs,
      toplists,
      currentToplist,
      showAllToplists,
      visibleToplists,
      playlistId,
      playlistInfo,
      directParse,
      canSearch,
      canPrevPage,
      canNextPage,
      resultTitle,
      switchTab,
      fetchToplists,
      searchFirstPage,
      prevPage,
      nextPage,
      fetchToplistSongs,
      fetchPlaylist,
      getParseItem,
      parseSong,
      downloadSong,
      parseById,
      downloadById,
      resetForSource,
    };
  },
  template: `
    <div class="page-wrap">
      <div class="hero">
        <h1 class="hero-title">MusicFree</h1>
        <p class="hero-subtitle">搜索、解析、试听、下载</p>
      </div>

      <div class="app-card">
        <div class="tabs">
          <button class="tab-btn" :class="{ active: activeTab === 'search' }" @click="switchTab('search')">音乐搜索</button>
          <button class="tab-btn" :class="{ active: activeTab === 'id' }" @click="switchTab('id')">ID/歌单解析</button>
          <button class="tab-btn" :class="{ active: activeTab === 'rank' }" @click="switchTab('rank')">热门榜单</button>
        </div>

        <div class="panel">
          <section v-show="activeTab === 'search'" class="tab-panel">
            <div class="inline-form">
              <select class="select" v-model="source" @change="resetForSource">
                <option v-for="s in SOURCE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
              <input
                class="input"
                v-model="keyword"
                placeholder="输入歌名或歌手..."
                @keyup.enter="searchFirstPage"
              />
              <button class="btn primary" :disabled="!canSearch" @click="searchFirstPage">
                {{ searching ? '搜索中...' : '搜索' }}
              </button>
            </div>
            <p class="hint">每页 10 条，支持翻页。</p>
          </section>

          <section v-show="activeTab === 'id'" class="tab-panel">
            <div class="block">
              <h3 class="section-title">音乐 ID 解析</h3>
              <div class="inline-form">
                <input
                  class="input"
                  v-model="directParse.id"
                  placeholder="输入音乐 ID..."
                  @keyup.enter="parseById"
                />
                <select class="select quality" v-model="directParse.quality">
                  <option v-for="q in QUALITY_OPTIONS" :key="q.value" :value="q.value">{{ q.label }}</option>
                </select>
                <button class="btn primary" @click="parseById" :disabled="directParse.loading">
                  {{ directParse.loading ? '解析中...' : '解析' }}
                </button>
                <button class="btn ghost" @click="downloadById">下载</button>
              </div>
              <div class="audio-wrap" v-if="directParse.url">
                <audio controls :src="directParse.url"></audio>
                <p class="tip">下载链接：<a :href="directParse.url" target="_blank">打开</a></p>
                <p class="tip" v-if="directParse.actualQuality">实际音质：{{ directParse.actualQuality }}</p>
              </div>
              <p class="error-text" v-if="directParse.error">{{ directParse.error }}</p>
            </div>

            <div class="block">
              <h3 class="section-title">歌单 ID 解析</h3>
              <div class="inline-form">
                <input
                  class="input"
                  v-model="playlistId"
                  placeholder="输入歌单 ID 或链接中的 ID..."
                  @keyup.enter="fetchPlaylist"
                />
                <button class="btn ghost" @click="fetchPlaylist" :disabled="loading">解析歌单</button>
              </div>
              <p class="hint">支持粘贴歌单链接中的数字 ID。</p>
              <div class="playlist-box" v-if="playlistInfo">
                <p class="song-name">{{ playlistInfo.name }}</p>
                <p class="song-meta">作者：{{ playlistInfo.author || '未知' }} · 播放：{{ playlistInfo.playCount || 0 }}</p>
                <p class="song-meta" v-if="playlistInfo.desc">简介：{{ playlistInfo.desc }}</p>
              </div>
            </div>
          </section>

          <section v-show="activeTab === 'rank'" class="tab-panel">
            <div class="inline-form">
              <select class="select" v-model="source" @change="resetForSource">
                <option v-for="s in SOURCE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
              <button class="btn ghost" @click="fetchToplists" :disabled="loading">
                {{ loading ? '加载中...' : '刷新榜单' }}
              </button>
              <button
                class="btn ghost"
                v-if="toplists.length > TOPLIST_PREVIEW_COUNT"
                @click="showAllToplists = !showAllToplists"
              >
                {{ showAllToplists ? '只看前8个' : '查看更多' }}
              </button>
            </div>
            <div class="rank-grid">
              <button class="rank-item" v-for="item in visibleToplists" :key="item.id" @click="fetchToplistSongs(item)">
                <strong>{{ item.name }}</strong>
                <span>{{ item.updateFrequency || '定期更新' }}</span>
              </button>
            </div>
          </section>
        </div>

        <div id="results-area" class="results-card" v-if="activeTab === resultMode && (songs.length > 0 || msg.text || msg.error)">
          <div class="result-head">
            <span v-if="songs.length > 0">{{ resultTitle }} · 共 {{ songs.length }} 首</span>
            <span>当前源：{{ sourceLabel }}</span>
          </div>

          <p class="tip" v-if="msg.text">{{ msg.text }}</p>
          <p class="error-text" v-if="msg.error">{{ msg.error }}</p>

          <div class="song-list" v-if="songs.length > 0">
            <div class="song-item" v-for="song in songs" :key="song.source + ':' + song.id">
              <div class="song-top">
                <div class="song-main">
                  <p class="song-name">{{ song.name || '未知歌曲' }}</p>
                  <p class="song-meta">{{ song.artist || '未知歌手' }} · {{ song.album || '未知专辑' }}</p>
                  <p class="song-meta">ID：{{ song.id }} <span v-if="song.source">· 来源：{{ song.source }}</span></p>
                </div>

                <div class="song-actions">
                  <select class="select quality compact" v-model="getParseItem(song).quality">
                    <option v-for="q in QUALITY_OPTIONS" :key="q.value" :value="q.value">{{ q.label }}</option>
                  </select>
                  <button class="btn primary compact" @click="parseSong(song)" :disabled="getParseItem(song).loading">
                    {{ getParseItem(song).loading ? '解析中...' : '试听/解析' }}
                  </button>
                  <button class="btn ghost compact" @click="downloadSong(song)">下载</button>
                </div>
              </div>

              <div class="audio-wrap" v-if="getParseItem(song).url">
                <audio controls :src="getParseItem(song).url"></audio>
                <p class="tip">下载链接：<a :href="getParseItem(song).url" target="_blank">打开</a></p>
                <p class="tip" v-if="getParseItem(song).actualQuality">实际音质：{{ getParseItem(song).actualQuality }}</p>
              </div>

              <p class="error-text" v-if="getParseItem(song).error">{{ getParseItem(song).error }}</p>
            </div>
          </div>

          <div class="pager" v-if="hasSearchResult">
            <button class="btn ghost pager-btn" @click="prevPage" :disabled="!canPrevPage">上一页</button>
            <span class="pager-text">第 {{ page }} 页</span>
            <button class="btn ghost pager-btn" @click="nextPage" :disabled="!canNextPage">下一页</button>
          </div>
        </div>
      </div>
    </div>
  `,
};

createApp(App).mount("#app");
