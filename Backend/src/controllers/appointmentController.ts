import { Request, Response } from 'express';
import * as appointmentService from '../services/appointmentService';
import { AppError } from '../utils/AppError';

export const scheduleAppointment = async (req: Request, res: Response) => {
  const appointment = await appointmentService.scheduleAppointment({
    patientId: req.user!.id,
    scheduleId: req.body.scheduleId,
  });
  res.status(201).json({ message: 'Cita agendada correctamente', appointment });
};

export const cancelAppointment = async (req: Request, res: Response) => {
  const appointment = await appointmentService.cancelAppointment(req.params.id, req.user!);
  res.status(200).json({ message: 'Cita cancelada correctamente', appointment });
};

/** Citas del usuario autenticado: las suyas como paciente o como psicólogo. */
export const getAppointments = async (req: Request, res: Response) => {
  const { id, role } = req.user!;

  if (role === 'paciente') {
    res.status(200).json(await appointmentService.getAppointmentsByPatient(id));
  } else if (role === 'psicologo') {
    res.status(200).json(await appointmentService.getAppointmentsByPsychologist(id));
  } else {
    throw new AppError(403, 'Solo pacientes y psicólogos tienen citas propias');
  }
};

/** Único cambio de estado permitido aquí: marcar la cita como completada. */
export const updateAppointment = async (req: Request, res: Response) => {
  const body = req.body;
  const forbidden = Object.keys(body).filter((key) => key !== 'state');
  if (forbidden.length > 0) {
    throw new AppError(403, `No puedes modificar: ${forbidden.join(', ')}`);
  }
  if (body.state === 'cancelada') {
    throw new AppError(400, 'Para cancelar una cita usa PATCH /appointment/cancel/:id');
  }
  if (body.state !== 'completada') {
    throw new AppError(400, "state debe ser 'completada'");
  }

  const updatedAppointment = await appointmentService.completeAppointment(req.params.id, req.user!);
  res.status(200).json({ message: 'Cita actualizada correctamente', updatedAppointment });
};
