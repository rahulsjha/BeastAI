import { PageLayout } from "@/layouts";

const Dashboard = () => {
  return (
    <PageLayout
      title="Dashboard"
      description="Bring your own AI and speech-to-text providers in Settings. No license or account is required."
    >
      <div className="text-sm text-muted-foreground">
        Add your providers under Dev Space (AI and Speech-to-Text), then start
        from the main window.
      </div>
    </PageLayout>
  );
};

export default Dashboard;
