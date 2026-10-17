# Performance Rules — 5

## UX-PERF-MEDIA-LAZY-VIRTUALIZATION — MUST

非关键媒体可按需加载；长列表是否虚拟化基于真实规模和测量，不按固定“几十项”判断。虚拟化同时保留焦点、选择、查找和可访问定位，不只验证滚动帧率。

## UX-PERF-CLEANUP-LISTENERS — MUST

监听、timer、observer、AbortController、ObjectURL/stream 等由明确 owner 在责任结束时清理；组件卸载不是唯一生命周期。迟到请求/回调要验证 epoch/scope，不能关闭其他任务仍共享的资源。

## UX-PERF-RESOURCE-LOADING — MUST

关键资源及时加载，低频/大资源按真实任务边界拆分或预热。静态导入的模块不会因为另一处 dynamic import 自动拆包；图片尺寸、字体加载、首屏稳定和页面切换都需真实验证。性能设计同时考虑用户感知：Shell/导航等稳定框架不因局部数据请求反复重建，关键内容可以渐进填充，但不能用大面积 skeleton 闪烁掩盖不必要的等待。

## UX-PERF-MEASURED-BUDGET — SHOULD

性能结论基于冻结场景、浏览器/设备、数据规模和冷/热状态实测；同时记录实际耗时和 perceived performance（首次可操作反馈、布局稳定、已有内容是否被清空、等待反馈是否及时）。build 成功、chunk warning 或小 fixture 通过不能外推生产大数据场景。

## UX-PERF-CACHE-OWNERSHIP — MUST

缓存有明确 scope、版本和失效条件，只加速读取，不成为领域真值。切换用户、Platform、权限、版本或查询时不能误复用旧缓存；错误恢复不通过“清空用户真实数据”解决。
