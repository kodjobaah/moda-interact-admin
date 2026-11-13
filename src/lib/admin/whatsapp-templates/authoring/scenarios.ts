import type { MetaTemplateAst } from "./types";
/** Reviewed body-only suggestions. Selecting one creates an unsaved draft, never a registration or offer. */
export const RECOVERY_SCENARIOS: ReadonlyArray<{ id: string; label: string; draft: MetaTemplateAst }> = [
  {
    "id": "INITIAL_NO_OFFER",
    "label": "Initial reminder \u2014 no offer",
    "draft": {
      "schemaVersion": 1,
      "family": "META_RECOVERY",
      "sourceLanguageTag": "en",
      "stage": "INITIAL",
      "offerType": "NO_OFFER",
      "header": [],
      "body": [
        {
          "type": "text",
          "value": "Your checkout is waiting for you.\n\nOriginal abandoned basket: "
        },
        {
          "type": "variable",
          "name": "checkout.itemsSummary"
        },
        {
          "type": "text",
          "value": ".\n\nFrom "
        },
        {
          "type": "variable",
          "name": "shop.name"
        },
        {
          "type": "text",
          "value": ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)."
        }
      ],
      "footer": [],
      "buttons": []
    }
  },
  {
    "id": "INITIAL_CODE_OFFER",
    "label": "Initial reminder \u2014 verified code offer",
    "draft": {
      "schemaVersion": 1,
      "family": "META_RECOVERY",
      "sourceLanguageTag": "en",
      "stage": "INITIAL",
      "offerType": "CODE_OFFER",
      "promotionTarget": "CHECKOUT",
      "header": [],
      "body": [
        {
          "type": "text",
          "value": "Your checkout is waiting for you.\n\nOriginal abandoned basket: "
        },
        {
          "type": "variable",
          "name": "checkout.itemsSummary"
        },
        {
          "type": "text",
          "value": ".\n\nOffer details: "
        },
        {
          "type": "variable",
          "name": "offer.description"
        },
        {
          "type": "text",
          "value": ".\nAvailable code: "
        },
        {
          "type": "variable",
          "name": "offer.code"
        },
        {
          "type": "text",
          "value": ". Subject to checkout eligibility.\n\nFrom "
        },
        {
          "type": "variable",
          "name": "shop.name"
        },
        {
          "type": "text",
          "value": ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)."
        }
      ],
      "footer": [],
      "buttons": []
    }
  },
  {
    "id": "INITIAL_AUTOMATIC_OFFER",
    "label": "Initial reminder \u2014 verified automatic offers",
    "draft": {
      "schemaVersion": 1,
      "family": "META_RECOVERY",
      "sourceLanguageTag": "en",
      "stage": "INITIAL",
      "offerType": "AUTOMATIC_OFFER",
      "promotionTarget": "CHECKOUT",
      "header": [],
      "body": [
        {
          "type": "text",
          "value": "Your checkout is waiting for you.\n\nOriginal abandoned basket: "
        },
        {
          "type": "variable",
          "name": "checkout.itemsSummary"
        },
        {
          "type": "text",
          "value": ".\n\nAvailable automatic offers: "
        },
        {
          "type": "variable",
          "name": "offer.description"
        },
        {
          "type": "text",
          "value": ". Subject to checkout eligibility. No code is needed.\n\nFrom "
        },
        {
          "type": "variable",
          "name": "shop.name"
        },
        {
          "type": "text",
          "value": ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes)."
        }
      ],
      "footer": [],
      "buttons": []
    }
  },
  {
    "id": "FOLLOW_UP_NO_OFFER",
    "label": "Follow-up reminder \u2014 no offer",
    "draft": {
      "schemaVersion": 1,
      "family": "META_RECOVERY",
      "sourceLanguageTag": "en",
      "stage": "FOLLOW_UP",
      "offerType": "NO_OFFER",
      "header": [],
      "body": [
        {
          "type": "text",
          "value": "A reminder about your checkout at "
        },
        {
          "type": "variable",
          "name": "shop.name"
        },
        {
          "type": "text",
          "value": ". You can return to it using the checkout link below.\n\nNeed help? Use WhatsApp's Reply option on this message, then type your question."
        }
      ],
      "footer": [],
      "buttons": []
    }
  },
  {
    "id": "FOLLOW_UP_CODE_OFFER",
    "label": "Follow-up reminder \u2014 verified code offer",
    "draft": {
      "schemaVersion": 1,
      "family": "META_RECOVERY",
      "sourceLanguageTag": "en",
      "stage": "FOLLOW_UP",
      "offerType": "CODE_OFFER",
      "promotionTarget": "CHECKOUT",
      "header": [],
      "body": [
        {
          "type": "text",
          "value": "A reminder about your checkout at "
        },
        {
          "type": "variable",
          "name": "shop.name"
        },
        {
          "type": "text",
          "value": ".\n\nOriginal abandoned basket: "
        },
        {
          "type": "variable",
          "name": "checkout.itemsSummary"
        },
        {
          "type": "text",
          "value": ".\n\nOffer details: "
        },
        {
          "type": "variable",
          "name": "offer.description"
        },
        {
          "type": "text",
          "value": ".\nAvailable code: "
        },
        {
          "type": "variable",
          "name": "offer.code"
        },
        {
          "type": "text",
          "value": ". Subject to checkout eligibility.\n\nNeed help? Use WhatsApp's Reply option on this message, then type your question."
        }
      ],
      "footer": [],
      "buttons": []
    }
  },
  {
    "id": "FOLLOW_UP_AUTOMATIC_OFFER",
    "label": "Follow-up reminder \u2014 verified automatic offers",
    "draft": {
      "schemaVersion": 1,
      "family": "META_RECOVERY",
      "sourceLanguageTag": "en",
      "stage": "FOLLOW_UP",
      "offerType": "AUTOMATIC_OFFER",
      "promotionTarget": "CHECKOUT",
      "header": [],
      "body": [
        {
          "type": "text",
          "value": "A reminder about your checkout at "
        },
        {
          "type": "variable",
          "name": "shop.name"
        },
        {
          "type": "text",
          "value": ".\n\nOriginal abandoned basket: "
        },
        {
          "type": "variable",
          "name": "checkout.itemsSummary"
        },
        {
          "type": "text",
          "value": ".\n\nAvailable automatic offers: "
        },
        {
          "type": "variable",
          "name": "offer.description"
        },
        {
          "type": "text",
          "value": ". Subject to checkout eligibility. No code is needed.\n\nNeed help? Use WhatsApp's Reply option on this message, then type your question."
        }
      ],
      "footer": [],
      "buttons": []
    }
  }
];
export function scenarioLabel(stage: string | null, offer: string | null): string {
  return RECOVERY_SCENARIOS.find(row => row.id === `${stage}_${offer}`)?.label ?? "Unrecognised recovery scenario";
}
