import { emailTemplates } from "../config/emailTemplates";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (templateName: string, to: string, ...args: any[]) => {
  console.log("Templates disponibles:", Object.keys(emailTemplates)); // Ver qué plantillas existen
  console.log("Template solicitado:", templateName);

  const templateFunction = emailTemplates[templateName as keyof typeof emailTemplates];

  if (!templateFunction) {
    console.error(`Error: No se encontró la plantilla con el nombre '${templateName}'`);
    throw new Error(`Plantilla de email '${templateName}' no encontrada`);
  }

  const { subject, html } = templateFunction(...args as [string, string, string]); // Generamos el email con los datos dinámicos

  try {
    const { data, error } = await resend.emails.send({
      from: "Soporte <support@magicamente.online>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Error al enviar el correo:", error);
      throw new Error("No se pudo enviar el email");
    }

    console.log("Correo enviado con éxito:", data);
    return data;
  } catch (error) {
    console.error("Error al enviar el correo:", error);
    throw new Error("Error al enviar el correo");
  }
};
