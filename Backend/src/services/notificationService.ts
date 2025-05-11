import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (emailData: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) => {
  try {
    const response = await resend.emails.send(emailData);

    if (response.error) {
      console.error("Error al enviar email:", response.error);
      throw new Error(`Error en Resend: ${JSON.stringify(response.error)}`);
    }

    return response;
  } catch (error: any) {
    console.error("Error al enviar correo:", error);
    throw new Error(error.message || "Error desconocido al enviar correo");
  }
};
