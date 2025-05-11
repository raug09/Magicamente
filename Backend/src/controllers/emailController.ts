import { Request, Response } from "express";
import { sendEmail } from "../services/emailService";

export const sendTestEmail = async (req: Request, res: Response) => {
  try {
    const { email, nombre } = req.body;
    console.log(email, nombre);
    
    const response = await sendEmail("confirmation", email, nombre);
    console.log(response);
    
    res.status(200).json({ message: "Correo enviado correctamente", response });
  } catch (error) {
    res.status(500).json({ message: "Error al enviar el correo", error });
  }
};
