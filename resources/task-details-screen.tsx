import React from "react";

export const TaskDetailsScreen = ({
  taskTitle,
  tldr,
  planMd,
  contributors,
  userComments = [],
}: any) => {
  const [commentText, setCommentText] = React.useState("");
  const [myComments, setMyComments] = React.useState<any[]>(userComments);

  const addComment = () => {
    const trimmed = (commentText || "").trim();
    if (!trimmed) return;

    setMyComments((prev) => [
      {
        id: `comment-${Date.now()}`,
        author: "You",
        color: "#4f46e5",
        text: trimmed,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      ...prev,
    ]);
    setCommentText("");
  };

  return (
    <Card size="md">
      <Col gap={2}>
        <Row align="center">
          <Title value={taskTitle} size="sm" />
        </Row>
        <Row gap={2} align="center">
          <Badge label="TL;DR" color="discovery" />
          <Text value={tldr} size="sm" color="secondary" />
        </Row>
      </Col>
      <Divider flush />
      <Row gap={3} align="start">
        <Col gap={2}>
          <Caption value="Current plan" color="secondary" />
          <Markdown value={planMd} />
        </Col>
        <Col gap={2}>
          <Caption value="Contributors' changes" color="secondary" />
          <Col gap={2}>
            {contributors.map((user) => (
              <Col
                key={user.id}
                gap={2}
                border={{ bottom: { size: 1 } }}
                padding={{ bottom: 2 }}
              >
                <Row gap={3}>
                  <Box
                    width={4}
                    height="28px"
                    radius="full"
                    background={user.color}
                  />
                  <Text value={user.name} size="sm" weight="semibold" />
                  <Spacer />
                  <Row gap={2}>
                    <Badge label={`+${user.inserts.length}`} color="success" />
                    <Badge label={`-${user.deletes.length}`} color="danger" />
                  </Row>
                </Row>
                {user.inserts.slice(0, 3).map((line, idx) => (
                  <Row key={`ins-${user.id}-${idx}`} gap={2} align="start">
                    <Icon name="plus" color={user.color} size="sm" />
                    <Text value={line} size="sm" color={user.color} />
                  </Row>
                ))}
                {user.deletes.slice(0, 3).map((line, idx) => (
                  <Row key={`del-${user.id}-${idx}`} gap={2} align="start">
                    <Icon name="empty-circle" color={user.color} size="sm" />
                    <Text value={line} size="sm" color={user.color} lineThrough />
                  </Row>
                ))}
              </Col>
            ))}
          </Col>
          <Divider />
          <Caption value="Add your comment" color="secondary" />
          <textarea
            value={commentText}
            placeholder="Write a comment..."
            onChange={(event) => setCommentText(event.target.value)}
            style={{
              width: "100%",
              minHeight: "88px",
              border: "1px solid var(--line)",
              borderRadius: "10px",
              padding: 8,
              font: "inherit",
            }}
          />
          <Row align="center">
            <Spacer />
            <Button label="Post comment" size="sm" onClick={addComment} />
          </Row>
          <Col gap={2}>
            <Caption value="My comments" color="secondary" />
            {myComments.map((item) => (
              <Col
                key={item.id}
                gap={1}
                border={{ size: 1 }}
                radius="md"
                padding={2}
              >
                <Row gap={2}>
                  <Text value={item.author} size="sm" weight="semibold" />
                  <Spacer />
                  <Caption value={item.time} />
                </Row>
                <Text value={item.text} size="sm" />
              </Col>
            ))}
          </Col>
        </Col>
      </Row>
    </Card>
  );
};
