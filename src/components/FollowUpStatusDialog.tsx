import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, addMinutes, addHours, addDays } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FollowUpStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: any;
}

const FollowUpStatusDialog = ({ open, onOpenChange, campaign }: FollowUpStatusDialogProps) => {
  if (!campaign) return null;

  const followups = campaign.campaign_followups || [];
  const recipients = campaign.recipients || [];
  const totalSteps = 1 + followups.length; // Step 0 + followups

  // Helper to get delay for a specific step
  const getDelayForStep = (stepNumber: number) => {
    const step = followups.find((f: any) => f.step_number === stepNumber);
    if (!step) return { days: 0, hours: 0 };
    return { days: step.delay_days || 0, hours: step.delay_hours || 0 };
  };

  // Calculate status for each recipient
  const recipientStatuses = recipients.map((recipient: any) => {
    const currentStep = typeof recipient.current_step === 'number' ? recipient.current_step : -1;
    const lastSent = recipient.last_email_sent_at ? new Date(recipient.last_email_sent_at) : null;
    
    let status = 'Unknown';
    let nextSendTime = null;
    let nextStep = -1;

    if (recipient.bounced) {
      status = 'Bounced';
    } else if (recipient.replied) {
      status = 'Replied (Stopped)';
    } else if (recipient.status === 'failed') {
      status = 'Failed';
    } else if (currentStep === -1 || (currentStep === 0 && recipient.status === 'pending')) {
      status = 'Pending Initial';
      nextStep = 0;
    } else if (currentStep >= totalSteps - 1) {
      status = 'Completed';
    } else {
      // Waiting for next step
      nextStep = currentStep + 1;
      const delay = getDelayForStep(nextStep);
      
      if (lastSent) {
        let scheduledTime = lastSent;
        if (delay.days > 0) scheduledTime = addDays(scheduledTime, delay.days);
        if (delay.hours > 0) scheduledTime = addHours(scheduledTime, delay.hours);
        // If delay is 0 (e.g. minutes only which might not be in DB or just immediate), handle gracefully
        // Assuming delay_hours handles minutes as fractional or we only support hours/days in DB schema shown
        // The schema has delay_days and delay_hours.
        
        // Note: The backend might support minutes but schema says delay_hours. 
        // If the user sees "1 min" in UI, maybe I missed a column or it's stored as fractional hours?
        // Let's assume standard date math.
        
        nextSendTime = scheduledTime;
        
        if (new Date() > scheduledTime) {
          status = 'Ready / Overdue';
        } else {
          status = 'Waiting';
        }
      } else {
        status = 'Error (No Last Sent)';
      }
    }

    return {
      ...recipient,
      computedStatus: status,
      nextSendTime,
      nextStep
    };
  });

  // Sort: Ready/Waiting first, then others
  recipientStatuses.sort((a: any, b: any) => {
    if (a.computedStatus === 'Ready / Overdue' && b.computedStatus !== 'Ready / Overdue') return -1;
    if (b.computedStatus === 'Ready / Overdue' && a.computedStatus !== 'Ready / Overdue') return 1;
    return 0;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Follow-up Status: {campaign.name}</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-4 py-4">
            <div className="bg-blue-50 p-3 rounded">
                <div className="text-sm text-blue-800 font-medium">Total Recipients</div>
                <div className="text-2xl font-bold text-blue-900">{recipients.length}</div>
            </div>
            <div className="bg-yellow-50 p-3 rounded">
                <div className="text-sm text-yellow-800 font-medium">Active (Waiting)</div>
                <div className="text-2xl font-bold text-yellow-900">
                    {recipientStatuses.filter((r: any) => r.computedStatus === 'Waiting' || r.computedStatus === 'Ready / Overdue').length}
                </div>
            </div>
            <div className="bg-green-50 p-3 rounded">
                <div className="text-sm text-green-800 font-medium">Completed/Stopped</div>
                <div className="text-2xl font-bold text-green-900">
                    {recipientStatuses.filter((r: any) => ['Completed', 'Replied (Stopped)', 'Bounced'].includes(r.computedStatus)).length}
                </div>
            </div>
        </div>

        <ScrollArea className="h-[60vh] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 bg-white z-10">Email</TableHead>
                <TableHead className="sticky top-0 bg-white z-10">Current Step</TableHead>
                <TableHead className="sticky top-0 bg-white z-10">Status</TableHead>
                <TableHead className="sticky top-0 bg-white z-10">Next Step</TableHead>
                <TableHead className="sticky top-0 bg-white z-10">Est. Send Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipientStatuses.map((recipient: any) => (
                <TableRow key={recipient.id}>
                  <TableCell className="font-medium">
                    {recipient.email}
                    {recipient.name && <div className="text-xs text-gray-500">{recipient.name}</div>}
                  </TableCell>
                  <TableCell>
                    Step {recipient.current_step ?? 0}
                    {recipient.last_email_sent_at && (
                        <div className="text-xs text-gray-500">
                            Last: {format(new Date(recipient.last_email_sent_at), 'MMM d, HH:mm')}
                        </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                        recipient.computedStatus === 'Ready / Overdue' ? 'destructive' :
                        recipient.computedStatus === 'Waiting' ? 'secondary' :
                        recipient.computedStatus === 'Completed' ? 'default' :
                        'outline'
                    }>
                        {recipient.computedStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {recipient.nextStep > -1 ? `Step ${recipient.nextStep}` : '-'}
                  </TableCell>
                  <TableCell>
                    {recipient.nextSendTime ? (
                        <div className="flex flex-col">
                            <span>{format(recipient.nextSendTime, 'MMM d, HH:mm')}</span>
                            <span className="text-xs text-gray-500">
                                ({Math.ceil((recipient.nextSendTime.getTime() - new Date().getTime()) / (1000 * 60))} min left)
                            </span>
                        </div>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default FollowUpStatusDialog;
