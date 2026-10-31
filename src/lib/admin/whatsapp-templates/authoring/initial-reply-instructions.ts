import type { ContentNode, PromotionTarget } from "./types";

type InstructionCopy = { from: string; checkout: string; alternativeProduct: string };

/** Reviewed provider-copy catalogue for every currently supported recovery locale. */
export const INITIAL_REPLY_INSTRUCTIONS = {
  "zh-Hans": {
    from: "来自 ",
    checkout: "。需要帮助处理这个购物篮吗？请使用此 WhatsApp 消息上的“回复”选项，然后输入您的问题或发送语音留言（最长 2 分钟）。",
    alternativeProduct: "。需要了解此优惠或购物篮吗？请使用此 WhatsApp 消息上的“回复”选项，然后输入您的问题或发送语音留言（最长 2 分钟）。",
  },
  "zh-Hant": {
    from: "來自 ",
    checkout: "。需要協助處理這個購物籃嗎？請使用此 WhatsApp 訊息上的「回覆」選項，然後輸入您的問題或傳送語音訊息（最長 2 分鐘）。",
    alternativeProduct: "。需要了解此優惠或購物籃嗎？請使用此 WhatsApp 訊息上的「回覆」選項，然後輸入您的問題或傳送語音訊息（最長 2 分鐘）。",
  },
  cs: {
    from: "Od ",
    checkout: ". Potřebujete pomoci s tímto košíkem? Použijte možnost Odpovědět přímo u této zprávy ve WhatsAppu a potom napište svůj dotaz nebo pošlete hlasovou zprávu (maximálně 2 minuty).",
    alternativeProduct: ". Potřebujete pomoci s touto nabídkou nebo košíkem? Použijte možnost Odpovědět přímo u této zprávy ve WhatsAppu a potom napište svůj dotaz nebo pošlete hlasovou zprávu (maximálně 2 minuty).",
  },
  da: {
    from: "Fra ",
    checkout: ". Har du brug for hjælp til denne kurv? Brug WhatsApps Svar-mulighed på denne besked, og skriv derefter dit spørgsmål, eller send en talebesked (op til 2 minutter).",
    alternativeProduct: ". Har du brug for hjælp til dette tilbud eller denne kurv? Brug WhatsApps Svar-mulighed på denne besked, og skriv derefter dit spørgsmål, eller send en talebesked (op til 2 minutter).",
  },
  nl: {
    from: "Van ",
    checkout: ". Hulp nodig met dit winkelmandje? Gebruik de WhatsApp-optie Beantwoorden op dit bericht en typ daarna je vraag of stuur een spraakbericht (maximaal 2 minuten).",
    alternativeProduct: ". Hulp nodig met deze aanbieding of je winkelmandje? Gebruik de WhatsApp-optie Beantwoorden op dit bericht en typ daarna je vraag of stuur een spraakbericht (maximaal 2 minuten).",
  },
  en: {
    from: "From ",
    checkout: ". Need help with this basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes).",
    alternativeProduct: ". Need help with this offer or your basket? Use WhatsApp's Reply option on this message, then type your question or send a voice note (up to 2 minutes).",
  },
  fi: {
    from: "Lähettäjä ",
    checkout: ". Tarvitsetko apua tämän ostoskorin kanssa? Käytä tämän WhatsApp-viestin Vastaa-toimintoa ja kirjoita kysymyksesi tai lähetä ääniviesti (enintään 2 minuuttia).",
    alternativeProduct: ". Tarvitsetko apua tämän tarjouksen tai ostoskorin kanssa? Käytä tämän WhatsApp-viestin Vastaa-toimintoa ja kirjoita kysymyksesi tai lähetä ääniviesti (enintään 2 minuuttia).",
  },
  fr: {
    from: "De ",
    checkout: ". Besoin d’aide avec ce panier ? Utilisez l’option Répondre sur ce message WhatsApp, puis saisissez votre question ou envoyez une note vocale (2 minutes maximum).",
    alternativeProduct: ". Besoin d’aide avec cette offre ou votre panier ? Utilisez l’option Répondre sur ce message WhatsApp, puis saisissez votre question ou envoyez une note vocale (2 minutes maximum).",
  },
  de: {
    from: "Von ",
    checkout: ". Brauchst du Hilfe mit diesem Warenkorb? Nutze in dieser WhatsApp-Nachricht die Option Antworten und schreibe dann deine Frage oder sende eine Sprachnachricht (bis zu 2 Minuten).",
    alternativeProduct: ". Brauchst du Hilfe mit diesem Angebot oder deinem Warenkorb? Nutze in dieser WhatsApp-Nachricht die Option Antworten und schreibe dann deine Frage oder sende eine Sprachnachricht (bis zu 2 Minuten).",
  },
  it: {
    from: "Da ",
    checkout: ". Hai bisogno di aiuto con questo carrello? Usa l’opzione Rispondi su questo messaggio WhatsApp, poi scrivi la tua domanda o invia un messaggio vocale (massimo 2 minuti).",
    alternativeProduct: ". Hai bisogno di aiuto con questa offerta o con il carrello? Usa l’opzione Rispondi su questo messaggio WhatsApp, poi scrivi la tua domanda o invia un messaggio vocale (massimo 2 minuti).",
  },
  ja: {
    from: "送信元: ",
    checkout: "。この買い物かごについてお困りですか？このWhatsAppメッセージの「返信」オプションを使い、質問を入力するか、音声メッセージを送信してください（最長2分）。",
    alternativeProduct: "。このオファーまたは買い物かごについてお困りですか？このWhatsAppメッセージの「返信」オプションを使い、質問を入力するか、音声メッセージを送信してください（最長2分）。",
  },
  ko: {
    from: "보낸 곳: ",
    checkout: ". 이 장바구니에 도움이 필요하신가요? 이 WhatsApp 메시지의 답장 옵션을 사용한 다음 질문을 입력하거나 음성 메시지를 보내세요(최대 2분).",
    alternativeProduct: ". 이 혜택이나 장바구니에 도움이 필요하신가요? 이 WhatsApp 메시지의 답장 옵션을 사용한 다음 질문을 입력하거나 음성 메시지를 보내세요(최대 2분).",
  },
  nb: {
    from: "Fra ",
    checkout: ". Trenger du hjelp med denne handlekurven? Bruk Svar-alternativet på denne WhatsApp-meldingen, og skriv deretter spørsmålet ditt eller send et talememo (opptil 2 minutter).",
    alternativeProduct: ". Trenger du hjelp med dette tilbudet eller handlekurven? Bruk Svar-alternativet på denne WhatsApp-meldingen, og skriv deretter spørsmålet ditt eller send et talememo (opptil 2 minutter).",
  },
  pl: {
    from: "Od ",
    checkout: ". Potrzebujesz pomocy z tym koszykiem? Użyj opcji Odpowiedz przy tej wiadomości WhatsApp, a następnie wpisz pytanie lub wyślij wiadomość głosową (maksymalnie 2 minuty).",
    alternativeProduct: ". Potrzebujesz pomocy z tą ofertą lub koszykiem? Użyj opcji Odpowiedz przy tej wiadomości WhatsApp, a następnie wpisz pytanie lub wyślij wiadomość głosową (maksymalnie 2 minuty).",
  },
  "pt-BR": {
    from: "De ",
    checkout: ". Precisa de ajuda com este carrinho? Use a opção Responder nesta mensagem do WhatsApp e depois digite sua pergunta ou envie uma mensagem de voz (até 2 minutos).",
    alternativeProduct: ". Precisa de ajuda com esta oferta ou com seu carrinho? Use a opção Responder nesta mensagem do WhatsApp e depois digite sua pergunta ou envie uma mensagem de voz (até 2 minutos).",
  },
  "pt-PT": {
    from: "De ",
    checkout: ". Precisa de ajuda com este cesto? Use a opção Responder nesta mensagem do WhatsApp e, em seguida, escreva a sua pergunta ou envie uma mensagem de voz (até 2 minutos).",
    alternativeProduct: ". Precisa de ajuda com esta oferta ou com o seu cesto? Use a opção Responder nesta mensagem do WhatsApp e, em seguida, escreva a sua pergunta ou envie uma mensagem de voz (até 2 minutos).",
  },
  es: {
    from: "De ",
    checkout: ". ¿Necesitas ayuda con esta cesta? Usa la opción Responder en este mensaje de WhatsApp y después escribe tu pregunta o envía una nota de voz (hasta 2 minutos).",
    alternativeProduct: ". ¿Necesitas ayuda con esta oferta o con tu cesta? Usa la opción Responder en este mensaje de WhatsApp y después escribe tu pregunta o envía una nota de voz (hasta 2 minutos).",
  },
  sv: {
    from: "Från ",
    checkout: ". Behöver du hjälp med den här varukorgen? Använd alternativet Svara på det här WhatsApp-meddelandet och skriv sedan din fråga eller skicka ett röstmeddelande (högst 2 minuter).",
    alternativeProduct: ". Behöver du hjälp med det här erbjudandet eller varukorgen? Använd alternativet Svara på det här WhatsApp-meddelandet och skriv sedan din fråga eller skicka ett röstmeddelande (högst 2 minuter).",
  },
  th: {
    from: "จาก ",
    checkout: " ต้องการความช่วยเหลือเกี่ยวกับตะกร้านี้ไหม ใช้ตัวเลือกตอบกลับบนข้อความ WhatsApp นี้ จากนั้นพิมพ์คำถามหรือส่งข้อความเสียง (ไม่เกิน 2 นาที)",
    alternativeProduct: " ต้องการความช่วยเหลือเกี่ยวกับข้อเสนอนี้หรือตะกร้าของคุณไหม ใช้ตัวเลือกตอบกลับบนข้อความ WhatsApp นี้ จากนั้นพิมพ์คำถามหรือส่งข้อความเสียง (ไม่เกิน 2 นาที)",
  },
  tr: {
    from: "Gönderen: ",
    checkout: ". Bu sepetle ilgili yardıma mı ihtiyacınız var? Bu WhatsApp mesajındaki Yanıtla seçeneğini kullanın, ardından sorunuzu yazın veya bir sesli not gönderin (en fazla 2 dakika).",
    alternativeProduct: ". Bu teklifle veya sepetinizle ilgili yardıma mı ihtiyacınız var? Bu WhatsApp mesajındaki Yanıtla seçeneğini kullanın, ardından sorunuzu yazın veya bir sesli not gönderin (en fazla 2 dakika).",
  },
} satisfies Record<string, InstructionCopy>;

export type InitialReplyLocale = keyof typeof INITIAL_REPLY_INSTRUCTIONS;

export function localizedInitialReplyNodes(languageTag: string, target: PromotionTarget | undefined): ContentNode[] {
  const copy = INITIAL_REPLY_INSTRUCTIONS[languageTag as InitialReplyLocale];
  if (!copy) throw new Error(`Unsupported initial-reply locale: ${languageTag}`);
  return [
    { type: "text", value: copy.from },
    { type: "variable", name: "shop.name" },
    { type: "text", value: target === "ALTERNATIVE_PRODUCT" ? copy.alternativeProduct : copy.checkout },
  ];
}
