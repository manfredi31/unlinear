import React from "react";

const WidgetHeader = ({ title, badgeLabel, subtitle }: any) => (
  <Col gap={2}>
    <Row align="center">
      <Title value={title} size="sm" />
    </Row>
    <Row gap={2} align="center">
      <Badge label={badgeLabel} color="discovery" />
      <Text value={subtitle} size="sm" color="secondary" />
    </Row>
  </Col>
);

export const TasksByRepoScreen = ({
  selectedProject,
  projectOptions = [],
  tasks = [],
  counts = { open: 0, total: 0 },
  repoName,
}: any) => {
  return (
    <Card size="md">
      <Col gap={2}>
        <WidgetHeader
          title="Tasks by repo"
          badgeLabel={`${counts.open}/${counts.total} open`}
          subtitle={repoName ?? "Choose a repo to filter tasks"}
        />
        <Select
          name="project.id"
          options={projectOptions}
          defaultValue={selectedProject}
          placeholder="Select a repo"
          variant="outline"
          onChangeAction={{ type: "project.select" }}
        />
      </Col>
      <Divider flush />

      {tasks.length === 0 ? (
        <Col align="center" padding={4}>
          <Text value="No tasks for this repo" color="secondary" />
        </Col>
      ) : (
        <ListView>
          {tasks.map((item) => (
            <ListViewItem
              key={item.id}
              gap={3}
              onClickAction={{ type: "task.open", payload: { id: item.id } }}
            >
              <Box
                background={item.done ? "green-400" : "alpha-10"}
                radius="sm"
                padding={2}
              >
                <Icon
                  name={item.done ? "check-circle-filled" : "empty-circle"}
                  size="lg"
                  color={item.done ? "success" : "secondary"}
                />
              </Box>
              <Col gap={0}>
                <Text value={item.title} size="sm" weight="semibold" />
                <Caption
                  value={`${item.repo} • ${item.done ? "Done" : "Open"}`}
                  color="secondary"
                />
              </Col>
              <Spacer />
              <Button
                label={item.done ? "Reopen" : "Done"}
                size="sm"
                variant="outline"
                onClickAction={{ type: "task.toggle", payload: { id: item.id } }}
              />
            </ListViewItem>
          ))}
        </ListView>
      )}
    </Card>
  );
};
