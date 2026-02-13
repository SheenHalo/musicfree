import { createApp, ref, reactive, computed, onMounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

const SOURCE_OPTIONS = [
  { label: "网易云", value: "netease" },
  { label: "QQ", value: "qq" },
  { label: "酷我", value: "kuwo" },
];

const QUALITY_OPTIONS = [
  { label: "128k", value: "128k" },
  { label: "320k", value: "320k" },
  { label: "flac", value: "flac" },
  { label: "flac24bit", value: "flac24bit" },
];

const TOPLIST_PREVIEW_COUNT = 8;

const App = {
  setup() {
    const theme = ref(localStorage.getItem("theme") || "light");
    const source = ref("kuwo");
    const keyword = ref("");
    const page = ref(1);
    const limit = ref(10);

    const loading = ref(false);
    const searching = ref(false);
    const msg = reactive({ text: "", error: "" });

    const songs = ref([]);
    const toplists = ref([]);
    const currentToplist = ref(null);
    const showToplists = ref(false);
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
    const visibleToplists = computed(() => {
      if (!showToplists.value) return [];
      if (showAllToplists.value) return toplists.value;
      return toplists.value.slice(0, TOPLIST_PREVIEW_COUNT);
    });

    function setTheme(next) {
      theme.value = next;
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    }

    function toggleTheme() {
      setTheme(theme.value === "dark" ? "light" : "dark");
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
        showToplists.value = false;
        showAllToplists.value = false;
      } catch (err) {
        msg.error = err.message;
      } finally {
        loading.value = false;
      }
    }

    async function searchSongs() {
      if (!keyword.value.trim()) {
        msg.error = "请输入歌曲关键词";
        return;
      }

      searching.value = true;
      msg.text = "";
      msg.error = "";
      currentToplist.value = null;
      playlistInfo.value = null;

      try {
        const data = await request("/api/search", {
          source: source.value,
          keyword: keyword.value.trim(),
          page: page.value,
          limit: limit.value,
        });
        songs.value = Array.isArray(data) ? data : [];

        if (songs.value.length === 0) {
          msg.text = "没有搜索到结果，请换关键词再试";
        } else {
          const differentSource = songs.value.some((item) => item.source && item.source !== source.value);
          if (differentSource) {
            msg.text = `已找到 ${songs.value.length} 条结果（当前平台结果为空，自动切换到可用平台）`;
          } else {
            msg.text = `找到 ${songs.value.length} 条结果`;
          }
        }
      } catch (err) {
        msg.error = err.message;
      } finally {
        searching.value = false;
      }
    }

    async function fetchToplistSongs(item) {
      if (!item || !item.id) return;

      loading.value = true;
      msg.error = "";
      msg.text = "";
      playlistInfo.value = null;

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

      loading.value = true;
      msg.text = "";
      msg.error = "";
      currentToplist.value = null;

      try {
        const data = await request("/api/playlist", { source: source.value, id });
        if (!data) {
          throw new Error("未获取到歌单数据");
        }
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
        if (!item || !item.url) {
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
        state.error = "请先点“试听/解析”，拿到下载链接";
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
        if (!item || !item.url) {
          throw new Error(item?.error || "该 ID 暂时无法解析");
        }
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
        const el = document.getElementById("song-list");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 80);
    }

    function resetForSource() {
      songs.value = [];
      currentToplist.value = null;
      playlistInfo.value = null;
      showToplists.value = false;
      msg.text = "";
      msg.error = "";
      directParse.id = "";
      directParse.url = "";
      directParse.error = "";
      fetchToplists();
    }

    onMounted(() => {
      setTheme(theme.value);
      fetchToplists();
    });

    return {
      SOURCE_OPTIONS,
      QUALITY_OPTIONS,
      TOPLIST_PREVIEW_COUNT,
      theme,
      source,
      keyword,
      page,
      limit,
      loading,
      searching,
      msg,
      songs,
      toplists,
      currentToplist,
      showToplists,
      showAllToplists,
      visibleToplists,
      playlistId,
      playlistInfo,
      directParse,
      canSearch,
      toggleTheme,
      fetchToplists,
      searchSongs,
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
    <div class="container">
      <div class="topbar">
        <div class="brand-wrap">
          <div class="logo-note" aria-hidden="true">🎵</div>
          <div>
            <h1 class="title">MusicFree</h1>
            <p class="subtitle">搜索、试听、下载</p>
          </div>
        </div>
        <button class="theme-btn" @click="toggleTheme">
          {{ theme === 'dark' ? '切换浅色' : '切换深色' }}
        </button>
      </div>

      <div class="card notice-card">
        <p class="notice-text">提醒：目前 QQ、网易音乐搜索不稳定，建议使用对应音乐 ID 进行解析下载。</p>
      </div>

      <div class="card">
        <div class="row">
          <select class="select" v-model="source" @change="resetForSource">
            <option v-for="s in SOURCE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
          <input class="input" v-model="keyword" placeholder="输入歌曲名，例如：晴天" @keyup.enter="searchSongs" />
          <input class="select" type="number" v-model="page" min="1" placeholder="页码" style="width: 90px;" />
          <input class="select" type="number" v-model="limit" min="1" max="50" placeholder="数量" style="width: 90px;" />
          <button class="btn" :disabled="!canSearch" @click="searchSongs">
            {{ searching ? '搜索中...' : '搜索' }}
          </button>
        </div>
      </div>

      <div class="card">
        <h3 class="block-title">按音乐 ID 解析下载</h3>
        <div class="row">
          <input class="input" v-model="directParse.id" placeholder="输入音乐 ID，例如：1974443814" @keyup.enter="parseById" />
          <select class="select quality" v-model="directParse.quality">
            <option v-for="q in QUALITY_OPTIONS" :key="q.value" :value="q.value">{{ q.label }}</option>
          </select>
          <button class="btn" @click="parseById" :disabled="directParse.loading">
            {{ directParse.loading ? '解析中...' : '解析 ID' }}
          </button>
          <button class="btn secondary" @click="downloadById">下载</button>
        </div>
        <div class="audio-wrap" v-if="directParse.url">
          <audio controls :src="directParse.url"></audio>
          <p class="msg">下载链接：<a :href="directParse.url" target="_blank">打开</a></p>
          <p class="msg" v-if="directParse.actualQuality">实际音质：{{ directParse.actualQuality }}</p>
        </div>
        <p class="msg error" v-if="directParse.error">{{ directParse.error }}</p>
      </div>

      <div class="card">
        <h3 class="block-title">歌单详情</h3>
        <div class="row">
          <input class="input" v-model="playlistId" placeholder="输入歌单 ID，例如：3778678" @keyup.enter="fetchPlaylist" />
          <button class="btn secondary" @click="fetchPlaylist" :disabled="loading">加载歌单</button>
        </div>
        <div v-if="playlistInfo" style="margin-top: 10px;">
          <p class="song-name">{{ playlistInfo.name }}</p>
          <p class="song-meta">作者：{{ playlistInfo.author || '未知' }} · 播放：{{ playlistInfo.playCount || 0 }}</p>
          <p class="song-meta" v-if="playlistInfo.desc">简介：{{ playlistInfo.desc }}</p>
        </div>
      </div>

      <div class="card" v-if="msg.text || msg.error">
        <div class="msg" v-if="msg.text">{{ msg.text }}</div>
        <div class="msg error" v-if="msg.error">{{ msg.error }}</div>
      </div>

      <div id="song-list" class="card">
        <h3 class="block-title">歌曲列表（{{ songs.length }}）</h3>
        <div class="list">
          <div class="item" v-for="song in songs" :key="song.source + ':' + song.id">
            <div class="item-top">
              <div>
                <p class="song-name">{{ song.name || '未知歌曲' }}</p>
                <p class="song-meta">{{ song.artist || '未知歌手' }} · {{ song.album || '未知专辑' }}</p>
                <p class="song-meta">ID: {{ song.id }} <span v-if="song.source">· 来源：{{ song.source }}</span></p>
              </div>
            </div>

            <div class="item-actions">
              <select class="select quality" v-model="getParseItem(song).quality">
                <option v-for="q in QUALITY_OPTIONS" :key="q.value" :value="q.value">{{ q.label }}</option>
              </select>
              <button class="btn" @click="parseSong(song)" :disabled="getParseItem(song).loading">
                {{ getParseItem(song).loading ? '解析中...' : '试听/解析' }}
              </button>
              <button class="btn secondary" @click="downloadSong(song)">下载</button>
            </div>

            <div class="audio-wrap" v-if="getParseItem(song).url">
              <audio controls :src="getParseItem(song).url"></audio>
              <p class="msg">下载链接：<a :href="getParseItem(song).url" target="_blank">打开</a></p>
              <p class="msg" v-if="getParseItem(song).actualQuality">实际音质：{{ getParseItem(song).actualQuality }}</p>
            </div>

            <p class="msg error" v-if="getParseItem(song).error">{{ getParseItem(song).error }}</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="block-title">热门榜单（{{ SOURCE_OPTIONS.find(i => i.value === source)?.label }}）</h3>
        <div class="row toplist-actions">
          <button class="btn secondary" @click="fetchToplists" :disabled="loading">刷新榜单</button>
          <button
            class="btn secondary"
            @click="showToplists = !showToplists"
          >
            {{ showToplists ? '收起榜单' : '展开榜单' }}
          </button>
          <button
            v-if="showToplists && toplists.length > TOPLIST_PREVIEW_COUNT"
            class="btn secondary"
            @click="showAllToplists = !showAllToplists"
          >
            {{ showAllToplists ? '只看前8个' : '展开更多榜单' }}
          </button>
        </div>
        <div class="msg" v-if="!showToplists">榜单已折叠，点击“展开榜单”查看。</div>
        <div class="toplist-grid" v-if="showToplists">
          <div class="top-item" v-for="item in visibleToplists" :key="item.id" @click="fetchToplistSongs(item)">
            <h4>{{ item.name }}</h4>
            <p>{{ item.updateFrequency || '定期更新' }}</p>
          </div>
        </div>
      </div>
    </div>
  `,
};

createApp(App).mount("#app");
