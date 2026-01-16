# PanelX

PanelX is a modern, configurable sidebar panel for Home Assistant.  
It provides a clean overlay panel with sections, entities, embedded cards, presets, and a full visual editor.

PanelX is designed to feel native to Home Assistant while giving you far more control over layout, styling, and content.

---

## ✨ Features

- 📌 Right or left sidebar overlay
- 👁️ Collapsible or always-visible modes
- 🧩 Sections with entities and embedded cards
- 🧲 Drag & drop reordering
- 🧠 Visual editor + code editor
- 🎨 Built-in presets + fully custom styling
- 🧱 Embed any Home Assistant card
- ✍️ Optional custom CSS (overlay only)
- 🖥️ Inline preview while editing

---

## 📦 Installation

### Option 1: HACS (recommended)

> PanelX will appear under **Frontend → Lovelace → Custom Cards**

1. Open **HACS**
2. Go to **Frontend**
3. Click **Explore & Download Repositories**
4. Search for **PanelX**
5. Install
6. Restart Home Assistant

---

### Option 2: Manual installation

1. Download `panelx-card.js` from this repository
2. Copy it to: /config/www/panelx-card.js
3. Add the resource in Home Assistant: **Settings → Dashboards → Resources**
```yaml
url: /local/panelx-card.js
type: module
4. Reload the browser 

---

### 🚀 Basic Example

```yaml
type: custom:panelx-card
title: PanelX

sections:
  - title: Quick Actions
    items:
      - type: entity
        entity: light.office
        secondary: state

      - type: entity
        entity: switch.kettle
        secondary: last_changed

---

### 🧠 Advanced Example

This example shows:

- Sidebar positioning
- Collapsible toggle
- Custom styling
- Multiple sections
- Embedded cards
- Custom CSS

```yaml
type: custom:panelx-card
title: PanelX

sidebar:
  side: right
  visibility: collapsible

toggle:
  show: true
  position: middle
  size: 44

appearance:
  preset: custom
  width: 420
  dividers: true
  background: "rgba(20,20,20,0.86)"
  title_color: "rgba(255,255,255,0.95)"
  text_color: "rgba(255,255,255,0.90)"
  secondary_text_color: "rgba(255,255,255,0.68)"
  accent_color: "#4aa3ff"
  border_color: "rgba(255,255,255,0.14)"

sections:
  - title: Quick Actions
    items:
      - type: entity
        entity: light.office
        secondary: state

      - type: entity
        entity: switch.kettle
        name: Kettle
        icon: mdi:kettle
        secondary: last_changed

  - title: Status
    items:
      - type: card
        title: Weather
        editor_mode: visual
        card:
          type: weather-forecast
          entity: weather.home

      - type: card
        title: Notes
        editor_mode: code
        card:
          type: markdown
          content: |
            **PanelX**
            - Embedded cards work here
            - Markdown, graphs, custom cards, etc.

css: |
  .px-shell {
    border-radius: 22px;
  }

  .px-row {
    border-radius: 16px;
  }

  .px-section-title {
    letter-spacing: 0.14em;
  }

---

# ⚙️ Configuration Reference

## Sidebar
```yaml
sidebar:
  side: left | right
  visibility: collapsible | always_visible

## Toggle (only applies when collapsible)
```yaml
toggle:
  show: true | false
  position: top | middle | bottom
  size: 32-64

## Appearance
```yaml
appearance:
  preset: dark | light | blue | green | glass | custom
  width: number
  dividers: true | false

## Custom colors (only when preset = custom)
```yaml
appearance:
  background: string
  title_color: string
  text_color: string
  secondary_text_color: string
  accent_color: string
  border_color: string

## Sections
```yaml
sections:
  - title: string
    items: []

## Entity Item
```yaml
- type: entity
  entity: light.office
  name: Optional name
  icon: mdi:icon
  secondary: state | last_changed | none

## Embedded Card Item 
### Any Home Assistant card (including custom cards) can be embedded.
```yaml
- type: card
  title: Optional title
  editor_mode: visual | code
  card:
    type: markdown
    content: Hello world

## 🎨 Custom CSS
### Custom CSS is scoped to the overlay only. (You do not need to prefix selectors — PanelX automatically scopes them.)
```yaml
css: |
  .px-row {
    border-radius: 18px;
  }

---

### 🛠️ Development & Support

- Built using Lit
- Designed to follow Home Assistant UI conventions
- Issues and feature requests are welcome via GitHub