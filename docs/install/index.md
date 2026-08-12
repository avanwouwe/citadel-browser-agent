---
layout: default
title: Installation
nav_order: 2
has_children: true
---

Installing Citadel is relatively straightforward. There are a few moving parts: Citadel installs in the browser, on the OS, and —optionally— in your SIEM. There are sensible defaults, [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) takes care of everything except integration into your SIEM, and this guide walks you through each step. SIEM integration is only needed if you want logging, alerting, and centralized dashboards.

Citadel targets smaller organizations that do not have the budget or know-how to install and maintain a one or more complex security solutions. However, regular end-users can use [the installer](https://github.com/avanwouwe/citadel-browser-agent/releases/latest) to install Citadel, even outside the scope of an organization. In this case Citadel will remind instead of enforce, and you get most of the security benefits of Citadel, such as detection of bad domains, phishing, inadvertent pasting of secrets, or use of bad passwords. You will need to also [install osquery](https://osquery.io/downloads/official/) if you want Citadel to check the configuration of your device.

If you are installing Citadel as the administrator of an organization, check out the [configuration manual](/config/) to understand how you can adapt Citadel to your organization, for example by configuring your logo, name and support e-mail address. Don't forget to tell Citadel what your domain and official applications are, so that Citadel will take extra care of those, and users do not get false "shadow IT" warnings.

There is also the human side: users will at times be interrupted, warned or blocked; IT policy will likely be applied more strictly than it was before. Citadel takes great care to respect the privacy and agency of your users. Even so, deploying Citadel will undoubtedly raise questions. Depending on your organizational culture, this may need some preparation and communication ahead of the rollout. The [privacy section](/privacy/) provides useful templates to support you in compliance with privacy legislation, along with answers to frequently asked questions, to help you deal with all of this.