# 1. Architecture et API

L'architecture de **StackPages CMS** est conçue pour la simplicité, la performance et l'absence de base de données. Elle repose sur un modèle d'API sans serveur (Serverless) qui transforme votre contenu RSS en une ressource JSON immédiatement utilisable.

## Modèle "Headless" (Sans Tête)

Le Worker Cloudflare agit comme le "corps" du CMS en gérant la logique des données, tandis que le frontend (Webstudio) sert de "tête" en gérant l'affichage et le design.

* **Source de Vérité :** Votre flux RSS (Substack, Medium, etc.).
* **Couche d'Abstraction :** Le Cloudflare Worker.
* **Couche de Présentation :** Le Frontend (Webstudio).

Ce modèle garantit que le contenu est toujours synchronisé avec votre plateforme de blog principale, sans avoir besoin d'une base de données intermédiaire.
