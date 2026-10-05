"use client";

import React, { useEffect } from "react";
import { useApp } from "@/lib/store";
import { Portal } from "@/components/ui/Portal";
import NotificationsModal from "./modals/NotificationsModal";
import AddExpenseModal from "./modals/AddExpenseModal";
import ReportIssueModal from "./modals/ReportIssueModal";
import AddEventModal from "./modals/AddEventModal";
import AddMemberModal from "./modals/AddMemberModal";
import CreateAnnouncementModal from "./modals/CreateAnnouncementModal";
import CreateThreadModal from "./modals/CreateThreadModal";
import SwapDutyModal from "./modals/SwapDutyModal";
import ChangePasswordModal from "./modals/ChangePasswordModal";
import AiAssistantModal from "./modals/AiAssistantModal";

// Mỗi modal toàn cục là một file trong components/modals; mở bằng openModal("<tên>").
const REGISTRY: Record<string, React.ComponentType> = {
  notifications: NotificationsModal,
  addExpense: AddExpenseModal,
  reportIssue: ReportIssueModal,
  addEvent: AddEventModal,
  addMember: AddMemberModal,
  createAnnouncement: CreateAnnouncementModal,
  createThread: CreateThreadModal,
  swapDuty: SwapDutyModal,
  changePassword: ChangePasswordModal,
  aiAssistant: AiAssistantModal,
};

export const Modals: React.FC = () => {
  const { activeModal, closeModal } = useApp();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    if (activeModal) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeModal, closeModal]);

  const Body = activeModal ? REGISTRY[activeModal] : null;
  if (!Body) return null;

  return (
    <Portal>
      <div
        onClick={closeModal}
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 overflow-y-auto p-3 sm:p-5 animate-in fade-in duration-150"
      >
        <div className="flex min-h-full items-center justify-center">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-auto">
            <Body />
          </div>
        </div>
      </div>
    </Portal>
  );
};
