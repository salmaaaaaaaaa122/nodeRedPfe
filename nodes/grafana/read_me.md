# Node-RED Grafana Live WebSocket

Ce module Node-RED permet la communication en temps réel avec Grafana via WebSocket. Il fournit deux nœuds principaux :

1. **Grafana Out** - Envoie des données en temps réel à Grafana via WebSocket
2. **Grafana In** - Reçoit des événements et des données depuis Grafana via WebSocket

## Prérequis

- Node-RED v1.0.0 ou supérieur
- Grafana v8.0.0 ou supérieur avec Grafana Live activé
- Une clé API Grafana avec les autorisations appropriées

## Installation

Dans le répertoire de votre projet Node-RED, exécutez :

```bash
npm install node-red-contrib-grafana-live
```

Ou installez directement depuis l'interface de gestion des nœuds Node-RED.

## Configuration de Grafana

Pour pouvoir utiliser ces nœuds, vous devez activer Grafana Live dans votre configuration Grafana. Modifiez votre fichier `grafana.ini` :

```ini
[live]
enabled = true
```

## Utilisation

### Nœud Grafana Out

Ce nœud permet d'envoyer des données en temps réel à Grafana via l'API WebSocket.

#### Configuration

- **URL Grafana** : L'URL de votre serveur Grafana (ex: http://localhost:3000)
- **Clé API** : Une clé API Grafana avec permissions d'écriture
- **Canal** : Le canal Grafana Live à utiliser pour l'envoi des données
- **Topic** : Le sujet par défaut à utiliser pour les messages

#### Format des données d'entrée

Le nœud accepte un message avec `msg.payload` contenant les données à envoyer. Si `payload` n'est pas un objet, il sera converti en objet avec une propriété `value`.

Exemple :
```javascript
msg.payload = {
    temperature: 24.5,
    humidity: 65,
    status: "normal",
    timestamp: Date.now()
};
return msg;
```

### Nœud Grafana In

Ce nœud reçoit des événements et des données depuis Grafana via WebSocket.

#### Configuration

- **URL Grafana** : L'URL de votre serveur Grafana (ex: http://localhost:3000)
- **Clé API** : Une clé API Grafana avec permissions de lecture
- **Canal** : Le canal Grafana Live auquel s'abonner

#### Canaux Grafana courants

- `grafana/dashboard/uid/[DASHBOARD_UID]` - Événements pour un tableau de bord spécifique
- `grafana/dashboard/[DASHBOARD_UID]/annotations` - Annotations pour un tableau de bord
- `grafana/alerting/notification/[ALERT_ID]` - Notifications d'alertes
- `stream/[CHANNEL_ID]` - Canaux de données personnalisés

#### Format des données de sortie

Le nœud produit un message avec :
- `msg.payload` : Les données reçues de Grafana
- `msg.topic` : Le canal Grafana auquel le nœud est abonné

## Exemples

### Envoi de métriques de capteurs à Grafana

```javascript
// Nœud Function
const temperature = 24.5;
const humidity = 65;
const pressure = 1013.2;

msg.payload = {
    timestamp: Date.now(),
    temperature: temperature,
    humidity: humidity,
    pressure: pressure,