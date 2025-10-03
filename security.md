# Security Policy

## Overview

OKCVM is a self-hosted orchestration layer that provides a FastAPI web service and an agent runtime capable of executing shell commands, file operations, and network calls. Since the runtime has high-privilege tool access, deployment must treat it as highly sensitive infrastructure.

## Vulnerability Reporting

If you discover a security issue, please submit a private report using the GitHub Security Advisories feature (Security tab → “Report a vulnerability”). Do not disclose potential vulnerabilities in public Issues.

## Threat Model

We divide this project into personal users and server users.

For personal users, the main goal is to ensure that unexpected behavior does not affect other services on the computer or server (for example, deleting or writing files outside the working directory).

For multi-user scenarios, threats include:

1. Obvious SSRF (Server-Side Request Forgery) attacks.
2. Unauthorized reading of other users’ session data.

### Out-of-Scope Threats and Assumptions

* Individuals with full administrative access to the server or host machine, as well as the host or virtualization platform itself, are considered trusted. We do not attempt to defend against attackers who already control the server; therefore, local data is stored in plaintext without at-rest encryption.
* We assume the deployment runs in a trusted and access-controlled network environment; exposing it directly to the public internet without additional protection is out of scope.

## Basic Safeguards

* We recommend running on a dedicated server and isolated network segment.
* Enable appropriate request-rate limiting.
* Access to internal resources requires the correct identity token to avoid unauthorized retrieval of another user’s content.


---

# 安全策略

## 概述
OKCVM 是一个自托管的编排层，提供 FastAPI Web 服务和能够执行 Shell 命令、文件操作以及网络调用的智能体运行时。由于运行时具备高度权限的工具访问能力，部署时必须视其为高敏感度基础设施。

## 漏洞报告
如发现安全问题，请通过仓库的 GitHub Security Advisories 功能私下提交报告（Security 标签 → “Report a vulnerability”），切勿在公开 Issue 中披露潜在漏洞。

## 威胁模型
我们将这个项目分为个人用户和服务器用户。
对于个人用户而言，我们主要保证运行意外情况下不会影响电脑或者服务器上面的其他服务（例如删除或者写入非工作目录下的文件）。

对于多人用户而言，我们认为威胁包括：

1. 明显的SSRF攻击问题。
2. 对其他用户的会话数据读取等。


### 非目标威胁与假设
- 拥有服务器或宿主机完全管理员权限的人员、宿主机或虚拟化平台默认被视为可信。我们不试图防御已经控制服务器的攻击者，因此本地数据以明文形式存储，不提供静态加密。
- 假设部署运行在受信任且访问受控的网络环境；未经额外防护直接暴露在公网超出项目范围。

## 基础防护措施
- 我们建议在独立服务器和独立网段上运行。
- 启用适当的请求限制。
- 对于请求内部资源，需要通过携带对应的身份令牌来获取，避免获取其他人的内容。
## 负责任披露承诺
我们承诺及时处理每一份私密漏洞报告，与报告者协商修复时间表，并在适当情况下公开致谢。
