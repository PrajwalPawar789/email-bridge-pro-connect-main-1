/**
 * ActiveCampaignsTable Component
 * Table view of active campaigns with sticky row actions
 * Supports sorting, filtering, and bulk operations
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ActiveCampaignsTableProps } from '@/types/analytics';
import { ChevronRight, Pause, Play, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ActiveCampaignsTable: React.FC<ActiveCampaignsTableProps> = ({
  campaigns,
  loading = false,
  error = null,
  sortBy = 'replies',
  sortOrder = 'desc',
  onSort,
  onCampaignClick,
  onBulkAction,
}) => {
  // Sort campaigns
  const sortedCampaigns = useMemo(() => {
    if (!campaigns || campaigns.length === 0) return [];

    const sorted = [...campaigns].sort((a, b) => {
      let aVal: any = 0,
        bVal: any = 0;

      if (sortBy === 'sent') {
        aVal = a.sent;
        bVal = b.sent;
      } else if (sortBy === 'opens') {
        aVal = a.opens;
        bVal = b.opens;
      } else if (sortBy === 'clicks') {
        aVal = a.clicks;
        bVal = b.clicks;
      } else if (sortBy === 'replies') {
        aVal = a.replies;
        bVal = b.replies;
      } else if (sortBy === 'open-rate') {
        aVal = a.openRate;
        bVal = b.openRate;
      } else if (sortBy === 'click-rate') {
        aVal = a.clickRate;
        bVal = b.clickRate;
      } else if (sortBy === 'reply-rate') {
        aVal = a.replyRate;
        bVal = b.replyRate;
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  }, [campaigns, sortBy, sortOrder]);

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-green-100 text-green-900">Running</Badge>;
      case 'paused':
        return <Badge variant="outline" className="text-gray-600">Paused</Badge>;
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-900">Scheduled</Badge>;
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!sortedCampaigns || sortedCampaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Campaigns</CardTitle>
          <CardDescription>No active campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Create and launch a campaign to see analytics here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active Campaigns</CardTitle>
        <CardDescription>{sortedCampaigns.length} campaigns</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => onSort?.('name')}
              >
                <div className="flex items-center gap-2">
                  Campaign Name
                  <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                </div>
              </TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead
                className="text-right cursor-pointer hover:bg-gray-100"
                onClick={() => onSort?.('sent')}
              >
                <div className="flex items-center justify-end gap-2">
                  Sent
                  <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                </div>
              </TableHead>
              <TableHead
                className="text-right cursor-pointer hover:bg-gray-100"
                onClick={() => onSort?.('open-rate')}
              >
                <div className="flex items-center justify-end gap-2">
                  Open Rate
                  <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                </div>
              </TableHead>
              <TableHead
                className="text-right cursor-pointer hover:bg-gray-100"
                onClick={() => onSort?.('reply-rate')}
              >
                <div className="flex items-center justify-end gap-2">
                  Reply Rate
                  <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                </div>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCampaigns.map((campaign) => (
              <TableRow
                key={campaign.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onCampaignClick?.(campaign.id)}
              >
                <TableCell className="font-medium text-blue-600 hover:underline">
                  {campaign.name}
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(campaign.status)}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {campaign.sent.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {campaign.openRate.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right text-sm">
                  {campaign.replyRate.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title={campaign.status === 'running' ? 'Pause campaign' : 'Resume campaign'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBulkAction?.(
                          campaign.status === 'running' ? 'pause' : 'resume',
                          [campaign.id]
                        );
                      }}
                    >
                      {campaign.status === 'running' ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

ActiveCampaignsTable.displayName = 'ActiveCampaignsTable';
