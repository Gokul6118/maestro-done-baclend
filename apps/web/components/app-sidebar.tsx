"use client";

import { useAuthStore } from "@repo/store";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { BarChart, Briefcase, Home, Shield } from "lucide-react";
import Link from "next/link";

export default function AppSidebar() {
	return (
		<SidebarContent className="w-full p-2">
			<SidebarGroup>
				<SidebarGroupLabel className="text-xs">Menu</SidebarGroupLabel>

				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link href="/">
								<Home className="mr-2 h-4 w-4" />
								Home
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link href="/work">
								<Briefcase className="mr-2 h-4 w-4" />
								Work
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>

					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link href="/dashboard">
								<BarChart className="mr-2 h-4 w-4" />
								Dashboard
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroup>
		</SidebarContent>
	);
}
