# MUSIC FREE

## 需求
一个网页，用户可以在里面通过歌曲名字进行搜索，搜索出结果后可以试听和下载。
最近在linux发现了一个音乐解析API，支持网易、腾讯、酷我，提供了搜索的api，搜索出平台对应id后，再通过歌曲id进行解析。


## 技术栈 
后端：node.js/cloudflare works
前端：vue3
部署：vercel/cloudflare白嫖
域名：music.usersfree.com

## API
[TuneHub](https://tunehub.sayqz.com/docs)
APIKEY我放在.env文件中了，其名字是music_parser_key