# Config and Config Gallery

Config 是平台范围内、账户拥有的配置资源；Config Version 是用户可见的文件版本面，底层 private Storage 只是实现细节。

## 典型流程

1. `createConfig`
2. `createConfigVersionUploadIntent`
3. `putConfigVersionContent`（原始 binary）
4. `listConfigVersions` / `getConfigVersionContent`
5. 可选 `submitConfigToGallery`

Gallery 使用 `listConfigGallery` / `getConfigGalleryEntry` / like / content / apply，只暴露中央审核通过的 immutable Version。

## 边界

- 浏览器不直连 Storage。
- binary 不转成 text。
- size/content-type/quota 以中央合同与状态机为准。
- 不把 Gallery remove 等治理动作实现成删除用户个人 Config。
- Config ownership 来自 Principal，不从 body 传 platform_account_id。
